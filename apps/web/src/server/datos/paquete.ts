import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import {
  ESQUEMA_PROYECTO_EXPORTADO,
  type EscenaExportada,
  type ExportacionDeMontajeExportada,
  type MedioExportado,
  type OrigenMedio,
  type ProyectoExportado,
  type RevisionExportada,
  VERSION_PROYECTO_EXPORTADO,
} from "@/lib/proyecto-exportado";
import paquete from "../../../package.json";
import { db } from "../db/cliente";
import {
  type FilaMedio,
  media,
  montageExports,
  montages,
  musicTracks,
  projects,
  reviewResults,
  scenes,
} from "../db/esquema";
import { gastoDelProyecto } from "./historial";
import { retirarSecretos } from "./secretos";

/**
 * Lo que va dentro del ZIP de un proyecto, construido **por lista blanca** a partir de la base de datos. Nada de lo
 * que no esté escrito aquí sale: ni prompts, ni tareas del proveedor, ni credenciales, ni medios de otra cuenta, ni
 * documentos de consentimiento, ni fotos de referencia de los personajes.
 */

export interface ArchivoDelPaquete {
  ruta: string;
  /** Clave en el almacenamiento, para leerlo al empaquetar. */
  clave: string;
  bytes: number;
  medio: MedioExportado;
}

export interface Paquete {
  proyecto: ProyectoExportado;
  archivos: ArchivoDelPaquete[];
  /** Subtítulos de las exportaciones del montaje, como texto. */
  textos: { ruta: string; contenido: string }[];
  titulo: string;
}

const EXTENSIONES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
};

function extension(medio: FilaMedio): string {
  const conocida = EXTENSIONES[medio.mimeType];
  if (conocida) return conocida;
  const delNombre = medio.originalName.split(".").pop()?.toLowerCase() ?? "";
  return /^[a-z0-9]{1,5}$/.test(delNombre) ? delNombre : "bin";
}

const fecha = (d: Date | null) => (d ? d.toISOString() : null);
const dos = (n: number) => String(n).padStart(2, "0");

/** Recorre el objeto y retira los secretos de **cada texto**, sin tocar la estructura del JSON. */
function limpiar<T>(valor: T, secretos: string[], cuenta: { retirados: number }): T {
  if (typeof valor === "string") {
    const { texto, retirados } = retirarSecretos(valor, secretos);
    cuenta.retirados += retirados;
    return texto as T;
  }
  if (Array.isArray(valor)) return valor.map((v) => limpiar(v, secretos, cuenta)) as T;
  if (valor && typeof valor === "object") {
    return Object.fromEntries(
      Object.entries(valor as Record<string, unknown>).map(([k, v]) => [k, limpiar(v, secretos, cuenta)]),
    ) as T;
  }
  return valor;
}

/**
 * Arma el paquete del proyecto. `usuarioId` es el dueño que lo pidió: el proyecto y **cada medio** se filtran por él,
 * así que un medio de otra cuenta citado por error nunca entra.
 */
export async function armarPaquete(
  proyectoId: string,
  usuarioId: string,
  secretos: string[],
): Promise<{ paquete: Paquete; retirados: number }> {
  const [proyecto] = await db()
    .select()
    .from(projects)
    .where(and(eq(projects.id, proyectoId), eq(projects.userId, usuarioId)))
    .limit(1);
  if (!proyecto) throw new ErrorPaquete("El proyecto ya no existe.");

  const [escenas, montaje, pistas, revisiones, gasto] = await Promise.all([
    db().select().from(scenes).where(eq(scenes.projectId, proyecto.id)).orderBy(asc(scenes.sortOrder)),
    db().select().from(montages).where(eq(montages.projectId, proyecto.id)).limit(1),
    db().select().from(musicTracks).where(eq(musicTracks.projectId, proyecto.id)),
    db()
      .select()
      .from(reviewResults)
      .innerJoin(scenes, eq(scenes.id, reviewResults.sceneId))
      .where(and(eq(scenes.projectId, proyecto.id), isNull(reviewResults.invalidatedAt)))
      .orderBy(asc(reviewResults.createdAt)),
    gastoDelProyecto(proyecto.id),
  ]);
  const exportaciones = await db()
    .select()
    .from(montageExports)
    .where(and(eq(montageExports.projectId, proyecto.id), eq(montageExports.state, "listo")))
    .orderBy(asc(montageExports.createdAt));

  // Todos los medios citados, en una consulta, filtrados por dueño y sin documentos ni papelera.
  const citados = new Set<string>();
  for (const e of escenas) {
    for (const id of [
      e.approvedFrameMediaId,
      e.clipMediaId,
      e.voiceMediaId,
      e.singingAudioMediaId,
      e.referenceImageMediaId,
    ]) {
      if (id) citados.add(id);
    }
  }
  for (const p of pistas) citados.add(p.mediaId);
  for (const x of exportaciones) if (x.resultMediaId) citados.add(x.resultMediaId);
  const filas =
    citados.size === 0
      ? []
      : await db()
          .select()
          .from(media)
          .where(
            and(
              inArray(media.id, [...citados]),
              eq(media.ownerId, usuarioId),
              eq(media.isDocument, false),
              isNull(media.deletedAt),
            ),
          );
  const porId = new Map(filas.map((m) => [m.id, m]));

  const archivos: ArchivoDelPaquete[] = [];
  const rutaDe = new Map<string, string>();
  const incluir = (id: string | null, carpeta: string, nombre: string, origen: OrigenMedio): string | null => {
    if (!id) return null;
    const ya = rutaDe.get(id);
    if (ya) return ya;
    const medio = porId.get(id);
    if (!medio) return null;
    const ruta = `medios/${carpeta}/${nombre}.${extension(medio)}`;
    rutaDe.set(id, ruta);
    archivos.push({
      ruta,
      clave: medio.storageKey,
      bytes: medio.sizeBytes,
      // El sha256 se calcula al leer el archivo; hasta entonces va vacío.
      medio: { ruta, origen, tipo: medio.kind, mime: medio.mimeType, bytes: medio.sizeBytes, sha256: "" },
    });
    return ruta;
  };

  const escenasExportadas: EscenaExportada[] = escenas.map((e, i) => {
    const carpeta = `escena-${dos(i + 1)}`;
    return {
      id: e.id,
      orden: i + 1,
      guion: e.scriptText,
      accion: e.action,
      segundosPlanificados: e.plannedSeconds,
      estado: e.state,
      aprobadaEn: fecha(e.approvedAt),
      formatoClip: e.clipFormat,
      direccion: {
        plano: e.shotType,
        angulo: e.cameraAngle,
        movimientoCamara: e.cameraMove,
        microaccion: e.microAction,
        direccionDelDialogo: e.dialogueDirection,
        instrucciones: e.extraInstructions,
      },
      medios: {
        fotograma: incluir(e.approvedFrameMediaId, carpeta, "fotograma", "fotograma"),
        clip: incluir(e.clipMediaId, carpeta, "clip", "clip"),
        voz: incluir(e.voiceMediaId, carpeta, "voz", "voz"),
        cancion: incluir(e.singingAudioMediaId, carpeta, "cancion", "cancion"),
        referencia: incluir(e.referenceImageMediaId, carpeta, "referencia", "referencia"),
      },
    };
  });

  const musica = pistas.flatMap((p, i) => {
    const ruta = incluir(p.mediaId, "musica", `pista-${dos(i + 1)}`, "musica");
    return ruta ? [ruta] : [];
  });

  const textos: { ruta: string; contenido: string }[] = [];
  const exportacionesDelMontaje: ExportacionDeMontajeExportada[] = exportaciones.map((x, i) => {
    const base = `montaje-${dos(i + 1)}-${x.format}`;
    const srt = x.subtitlesSrt.trim() ? `subtitulos/${base}.srt` : null;
    const vtt = x.subtitlesVtt.trim() ? `subtitulos/${base}.vtt` : null;
    if (srt) textos.push({ ruta: srt, contenido: x.subtitlesSrt });
    if (vtt) textos.push({ ruta: vtt, contenido: x.subtitlesVtt });
    return {
      id: x.id,
      formato: x.format,
      ancho: x.width,
      alto: x.height,
      segundos: x.durationSeconds,
      creadaEn: x.createdAt.toISOString(),
      video: incluir(x.resultMediaId, "montaje", base, "montaje"),
      subtitulosSrt: srt,
      subtitulosVtt: vtt,
    };
  });

  const revisionesExportadas: RevisionExportada[] = revisiones.map(({ review_results: r }) => ({
    escenaId: r.sceneId,
    tipo: r.kind,
    veredicto: r.verdict,
    severidad: r.severity,
    fecha: r.createdAt.toISOString(),
    // Solo qué se comprobó y cómo salió: las notas son texto libre de quien revisó.
    comprobaciones: r.checks.map((c) => ({ clave: c.clave, resultado: c.resultado, severidad: c.severidad })),
  }));

  const m = montaje[0];
  const proyectoExportado: ProyectoExportado = {
    esquema: ESQUEMA_PROYECTO_EXPORTADO,
    version: VERSION_PROYECTO_EXPORTADO,
    exportadoEn: new Date().toISOString(),
    aplicacion: { nombre: "Escenara", version: paquete.version },
    proyecto: {
      id: proyecto.id,
      titulo: proyecto.title,
      formato: proyecto.format,
      estado: proyecto.state,
      idea: proyecto.idea,
      concepto: proyecto.concept,
      acabado: proyecto.renderStyle,
      segundosPorClip: proyecto.clipSeconds,
      creadoEn: proyecto.createdAt.toISOString(),
      actualizadoEn: proyecto.updatedAt.toISOString(),
    },
    escenas: escenasExportadas,
    montaje: m
      ? {
          version: m.version,
          formato: m.format,
          volumenVoz: m.voiceVolume,
          volumenMusica: m.musicVolume,
          subtitulosQuemados: m.burnSubtitles,
          etiquetaVisible: m.labelVisible,
        }
      : null,
    exportacionesDelMontaje,
    musica,
    revisiones: revisionesExportadas,
    gasto: { estimadoCreditos: gasto.estimado, consumidoCreditos: gasto.consumido },
    medios: archivos.map((a) => a.medio),
  };

  // El filtro de secretos pasa **solo por el texto libre del usuario** (título, idea, concepto, guion, acción, dirección
  // y subtítulos). Los campos fijos (esquema, identificadores, rutas, estados) salen de la lista blanca y no se tocan:
  // así una coincidencia con una palabra corriente nunca puede estropear el paquete.
  const cuenta = { retirados: 0 };
  const texto = (v: string) => limpiar(v, secretos, cuenta);
  const limpio: ProyectoExportado = {
    ...proyectoExportado,
    proyecto: {
      ...proyectoExportado.proyecto,
      titulo: texto(proyectoExportado.proyecto.titulo),
      idea: texto(proyectoExportado.proyecto.idea),
      concepto: texto(proyectoExportado.proyecto.concepto),
    },
    escenas: proyectoExportado.escenas.map((e) => ({
      ...e,
      guion: texto(e.guion),
      accion: texto(e.accion),
      direccion: limpiar(e.direccion, secretos, cuenta),
    })),
  };
  const textosLimpios = textos.map((t) => ({ ruta: t.ruta, contenido: texto(t.contenido) }));
  return {
    paquete: { proyecto: limpio, archivos, textos: textosLimpios, titulo: limpio.proyecto.titulo },
    retirados: cuenta.retirados,
  };
}

export class ErrorPaquete extends Error {}

/** `LEEME.md` del paquete: qué hay dentro, en castellano, sin datos de más. */
export function leeme(p: Paquete): string {
  const x = p.proyecto;
  return [
    `# ${x.proyecto.titulo || "Proyecto sin título"}`,
    "",
    `Exportado de Escenara ${x.aplicacion.version} el ${x.exportadoEn}.`,
    "",
    "## Qué hay en este paquete",
    "",
    "- `proyecto.json`: el proyecto, sus escenas con su dirección, el montaje, las revisiones y el gasto en créditos.",
    `  Sigue el esquema «${x.esquema}», versión ${x.version}. Cada medio que cita está en \`medios/\` con su huella SHA-256.`,
    "- `medios/escena-NN/`: el fotograma aprobado, el clip, la voz, la canción y la imagen de referencia de cada escena.",
    "- `medios/musica/`: la música del montaje.",
    "- `medios/montaje/` y `subtitulos/`: los vídeos montados y sus subtítulos.",
    "",
    `Archivos de medios: ${x.medios.length}. Escenas: ${x.escenas.length}.`,
    "",
    "## Qué no hay, a propósito",
    "",
    "- Ninguna clave de API, contraseña, credencial ni cabecera de autenticación.",
    "- Los prompts que se enviaron a los proveedores, que son material interno de la instalación.",
    "- Las fotos de referencia de tus personajes y sus documentos de consentimiento: siguen en tu biblioteca.",
    "- Nada de otra cuenta.",
    "",
    "Los vídeos montados llevan la etiqueta de contenido sintético con la que se exportaron.",
    "",
  ].join("\n");
}
