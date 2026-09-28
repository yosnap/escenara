import path from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import { formatearTamano, LIMITE_BYTES } from "@/lib/media/reglas";
import { duracionDeFragmento, duracionTotalDeFragmentos, type Fragmento } from "@/lib/montaje";
import { db } from "../db/cliente";
import { type FilaExportacion, type FilaMontaje, montageExports } from "../db/esquema";
import { type Actor, crearMedio, eliminarDefinitivamente, enviarAPapelera } from "../media/servicio";
import { medirConFfprobe } from "../revision/medicion";
import { conCarpetaTemporal, Descargador } from "./descarga";
import { ErrorMontaje } from "./errores";
import { exigirEtiquetaDibujable } from "./etiqueta";
import { ejecutar, exigirHerramientasDeRender, MS_MAXIMO_IGUALAR, MS_MAXIMO_MONTAR } from "./ffmpeg";
import type { EscenaConMaterial, MaterialDelProyecto } from "./material";
import { resolucionDe } from "./puerta";
import { listaDeConcatenacion, ordenDeIgualar, ordenDeMontar, type PistaDeMezcla } from "./render-ffmpeg";

/**
 * **El render del montaje** (RF08, 0.32.0): de la línea de tiempo a un MP4 vertical en la biblioteca del usuario.
 *
 * Lo hace el worker, no la petición del navegador: montar un vídeo tarda minutos y una petición HTTP colgada
 * durante minutos no es una barra de progreso, es un tiempo de espera agotado. El progreso que se ve son las
 * **etapas reales** de FFmpeg, apuntadas cuando ocurren.
 *
 * No cuesta créditos: no se llama a ningún proveedor. Lo único que consume es la **cuota de biblioteca** del
 * usuario, que la comprueba `crearMedio` dentro de su transacción, igual que con cualquier otro archivo suyo.
 *
 * Y es **idempotente**: el resultado se engancha con `where result_media_id is null`, así que si dos workers
 * llegaran a montar la misma exportación, solo uno la cierra y el otro borra su copia en lugar de dejar dos
 * ficheros comiéndose la cuota de alguien.
 */

/** Cada cuánto se escribe el progreso en la base de datos. Más a menudo sería una escritura por fotograma. */
const MS_ENTRE_APUNTES = 1_500;

/** Tolerancia entre la duración pedida y la que mide el MP4 resultante: es cómo se cierra un contenedor. */
const TOLERANCIA_DURACION = 1;

const detalle = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Últimas líneas de lo que dijo FFmpeg, para el registro del servidor. Nunca se le muestran al usuario. */
const ultimasLineas = (texto: string, cuantas = 6) =>
  texto.trim().split("\n").slice(-cuantas).join(" | ").slice(0, 1000);

// ── Progreso ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Apunta la etapa y el porcentaje de la exportación. Acota las escrituras en el tiempo: el progreso es
 * información, no un registro que haya que guardar fotograma a fotograma.
 */
class Progreso {
  private ultimoApunte = 0;
  private etapa: FilaExportacion["stage"] = "preparando";

  constructor(private readonly exportacionId: string) {}

  async entrarEn(etapa: FilaExportacion["stage"]): Promise<void> {
    this.etapa = etapa;
    this.ultimoApunte = 0;
    await this.escribir(0, true);
  }

  /** `hechos` y `total` en la unidad que sea (segundos de vídeo escritos, normalmente). */
  async avanzar(hechos: number, total: number): Promise<void> {
    const porciento = total > 0 ? Math.min(100, Math.max(0, (hechos / total) * 100)) : 0;
    await this.escribir(porciento, false);
  }

  private async escribir(porciento: number, forzar: boolean): Promise<void> {
    const ahora = Date.now();
    if (!forzar && ahora - this.ultimoApunte < MS_ENTRE_APUNTES) return;
    this.ultimoApunte = ahora;
    await db()
      .update(montageExports)
      .set({ stage: this.etapa, progress: Math.round(porciento * 10) / 10 })
      .where(eq(montageExports.id, this.exportacionId))
      .catch((error) => console.error(`[montaje] no se ha podido apuntar el progreso: ${detalle(error)}`));
  }
}

// ── El render ───────────────────────────────────────────────────────────────────────────────────────────────

/** Lo que hace falta para montar: el fragmento, su escena y sus archivos ya en disco. */
interface FragmentoPreparado {
  fragmento: Fragmento;
  escena: EscenaConMaterial;
  rutaClip: string;
  rutaVoz: string | null;
  tieneAudio: boolean;
  /** Segundo del montaje en el que empieza este fragmento. */
  desdeSegundos: number;
}

/**
 * Monta la exportación y la cierra. Devuelve la fila resultante.
 *
 * Quien llama ya se ha asegurado de que la exportación es suya y de que está tomada (`cola.ts`). Un fallo aquí se
 * convierte en una exportación `fallido` **con su causa concreta**, nunca en un «no se ha podido» genérico.
 */
export async function renderizarExportacion(
  actor: Actor,
  exportacion: FilaExportacion,
  montaje: FilaMontaje,
  material: MaterialDelProyecto,
): Promise<FilaExportacion> {
  await exigirHerramientasDeRender();
  // La etiqueta se comprueba **antes** de montar nada: si esta máquina no puede dibujarla, no se exporta. Un
  // vídeo con cara humana sin su etiqueta es peor que un vídeo que no se ha exportado.
  if (exportacion.labelApplied) await exigirEtiquetaDibujable();

  const progreso = new Progreso(exportacion.id);
  const { ancho, alto } = resolucionDe(montaje);
  const segundosTotales = duracionTotalDeFragmentos(montaje.fragments);

  return conCarpetaTemporal(async (carpeta) => {
    await progreso.entrarEn("preparando");
    const preparados = await prepararFragmentos(carpeta, montaje, material);
    const musica = await prepararMusica(carpeta, montaje, material);
    const rutaSubtitulos = await escribirSubtitulos(carpeta, exportacion);

    // ── Igualar: un proceso por fragmento, con los mismos parámetros para todos.
    await progreso.entrarEn("normalizando");
    const partes: string[] = [];
    let segundosIgualados = 0;
    for (const [indice, preparado] of preparados.entries()) {
      const duracion = duracionDeFragmento(preparado.fragmento);
      const salida = path.join(carpeta, `parte-${indice}.mp4`);
      const yaHechos = segundosIgualados;
      const { ok, error, agotado } = await ejecutar(
        ordenDeIgualar({
          ruta: preparado.rutaClip,
          entrada: preparado.fragmento.entrada,
          duracion,
          tieneAudio: preparado.tieneAudio,
          salida,
          ancho,
          alto,
        }),
        MS_MAXIMO_IGUALAR,
        (segundos) => void progreso.avanzar(yaHechos + Math.min(segundos, duracion), segundosTotales),
      );
      if (!ok) {
        console.error(`[montaje] igualar el fragmento ${indice + 1}: ${ultimasLineas(error)}`);
        throw new ErrorMontaje(
          422,
          agotado
            ? `El clip de la escena ${preparado.escena.escena.sortOrder} ha tardado demasiado en prepararse y el montaje se ha detenido. Prueba con un recorte más corto.`
            : `No se ha podido preparar el clip de la escena ${preparado.escena.escena.sortOrder}: el archivo no se puede convertir al formato del montaje. Vuelve a generar esa escena o quítala de la línea de tiempo.`,
        );
      }
      partes.push(salida);
      segundosIgualados += duracion;
    }

    // ── Montar: concatenar, mezclar, quemar subtítulos y componer la etiqueta.
    await progreso.entrarEn("montando");
    const lista = path.join(carpeta, "lista.txt");
    await Bun.write(lista, listaDeConcatenacion(partes));
    const salida = path.join(carpeta, "montaje.mp4");
    const { ok, error, agotado } = await ejecutar(
      ordenDeMontar({
        lista,
        voces: vocesDeLaMezcla(preparados, montaje),
        musica,
        volumenClip: material.proyecto.voiceMode === "pista" ? 1 : montaje.voiceVolume,
        subtitulos: exportacion.burnedSubtitles && rutaSubtitulos !== null ? rutaSubtitulos : null,
        etiqueta: exportacion.labelApplied ? exportacion.labelPosition : null,
        segundos: segundosTotales,
        ancho,
        alto,
        salida,
      }),
      MS_MAXIMO_MONTAR,
      (segundos) => void progreso.avanzar(segundos, segundosTotales),
    );
    if (!ok) {
      console.error(`[montaje] montar la exportación ${exportacion.id}: ${ultimasLineas(error)}`);
      throw new ErrorMontaje(
        agotado ? 504 : 422,
        agotado
          ? `El montaje ha tardado más de ${Math.round(MS_MAXIMO_MONTAR / 60_000)} minutos y se ha detenido. Divídelo en dos exportaciones más cortas.`
          : "No se ha podido montar el vídeo con estos clips. Revisa la revisión de continuidad de las escenas del montaje: alguno de sus archivos no se puede leer.",
      );
    }

    // ── Comprobar lo que ha salido de verdad, antes de guardarlo como bueno.
    const medidas = await medirConFfprobe(salida);
    if (!medidas.tieneVideo || medidas.ancho !== ancho || medidas.alto !== alto) {
      console.error(`[montaje] la salida no mide lo que debía (${medidas.ancho}×${medidas.alto}) en ${exportacion.id}`);
      throw new ErrorMontaje(
        500,
        `El vídeo montado no ha salido en ${ancho} × ${alto}, así que no se ha guardado. Vuelve a intentarlo y, si se repite, díselo a quien administra esta instalación.`,
      );
    }
    if (
      medidas.duracionSegundos !== null &&
      Math.abs(medidas.duracionSegundos - segundosTotales) > TOLERANCIA_DURACION
    ) {
      console.error(
        `[montaje] duración inesperada: ${medidas.duracionSegundos} s en lugar de ${segundosTotales} s (${exportacion.id})`,
      );
      throw new ErrorMontaje(
        500,
        `El vídeo montado dura ${Math.round(medidas.duracionSegundos)} s y la línea de tiempo suma ${Math.round(segundosTotales)} s, así que no se ha guardado. Vuelve a intentarlo.`,
      );
    }

    // ── Guardar en la biblioteca del usuario, con su cuota.
    await progreso.entrarEn("guardando");
    return guardarResultado(actor, exportacion, salida, medidas.duracionSegundos ?? segundosTotales);
  });
}

/** Baja los clips y las pistas de voz de los fragmentos, y mide si cada clip tiene audio. */
async function prepararFragmentos(
  carpeta: string,
  montaje: FilaMontaje,
  material: MaterialDelProyecto,
): Promise<FragmentoPreparado[]> {
  const descargador = new Descargador(carpeta);
  const porId = new Map(material.escenas.map((e) => [e.escena.id, e]));
  const preparados: FragmentoPreparado[] = [];
  let desdeSegundos = 0;
  for (const [indice, fragmento] of montaje.fragments.entries()) {
    const escena = porId.get(fragmento.escenaId);
    if (!escena?.clip) {
      // No debería llegar aquí: la puerta de controles lo bloquea antes. Si llega, se dice cuál falla.
      throw new ErrorMontaje(
        409,
        `El fragmento ${indice + 1} del montaje ya no tiene clip. Prodúcelo otra vez o quítalo de la línea de tiempo.`,
      );
    }
    const rutaClip = await descargador.bajar(escena.clip, `clip-${indice}`);
    const medidas = await medirConFfprobe(rutaClip);
    if (!medidas.tieneVideo) {
      throw new ErrorMontaje(
        422,
        `El clip de la escena ${escena.escena.sortOrder} no se puede leer, así que no se puede montar. Vuelve a generarlo.`,
      );
    }
    preparados.push({
      fragmento,
      escena,
      rutaClip,
      // La pista de voz aparte solo existe en modo `pista`; en los demás la voz viaja dentro del clip.
      rutaVoz:
        material.proyecto.voiceMode === "pista" && escena.voz
          ? await descargador.bajar(escena.voz, `voz-${indice}`)
          : null,
      tieneAudio: medidas.tieneAudio,
      desdeSegundos,
    });
    desdeSegundos += duracionDeFragmento(fragmento);
  }
  return preparados;
}

/** Pistas de voz de la mezcla, cada una en el segundo de su fragmento. */
function vocesDeLaMezcla(preparados: readonly FragmentoPreparado[], montaje: FilaMontaje): PistaDeMezcla[] {
  return preparados
    .filter((p): p is FragmentoPreparado & { rutaVoz: string } => p.rutaVoz !== null)
    .map((p) => ({ ruta: p.rutaVoz, volumen: montaje.voiceVolume, desdeMs: Math.round(p.desdeSegundos * 1000) }));
}

/**
 * Baja la música autorizada del proyecto. Su volumen es el de la pista **multiplicado** por el del montaje: uno
 * dice cómo suena esa canción y el otro, cuánta música lleva este montaje.
 */
async function prepararMusica(
  carpeta: string,
  montaje: FilaMontaje,
  material: MaterialDelProyecto,
): Promise<PistaDeMezcla[]> {
  const descargador = new Descargador(carpeta);
  const pistas: PistaDeMezcla[] = [];
  for (const [indice, pista] of material.musica.entries()) {
    pistas.push({
      ruta: await descargador.bajar(pista.medio, `musica-${indice}`),
      volumen: Math.min(2, pista.volumen * montaje.musicVolume),
      desdeMs: 0,
    });
  }
  return pistas;
}

/**
 * Escribe el fichero de subtítulos que se va a quemar, **tal como se guardó con la exportación**. Devuelve `null`
 * si no hay ninguno: entonces no se quema nada y la exportación lo dice.
 *
 * Siempre en SRT, que es lo que el filtro `subtitles` lee sin depender de nada más. El formato que eligió el
 * usuario gobierna el fichero **adjunto**, que es otra cosa: los dos se guardaron al pedir la exportación.
 */
async function escribirSubtitulos(carpeta: string, exportacion: FilaExportacion): Promise<string | null> {
  if (exportacion.subtitlesSrt.trim() === "") return null;
  const ruta = path.join(carpeta, "subtitulos.srt");
  await Bun.write(ruta, exportacion.subtitlesSrt);
  return ruta;
}

/**
 * Guarda el MP4 en la biblioteca del usuario y cierra la exportación.
 *
 * El enganche es `where result_media_id is null`: si otro worker la cerró antes, el archivo recién creado se borra
 * **de verdad** (no a la papelera, que seguiría ocupando su cuota por algo que no ha pedido), igual que hace el
 * seguimiento de trabajos con un resultado duplicado.
 */
async function guardarResultado(
  actor: Actor,
  exportacion: FilaExportacion,
  ruta: string,
  duracion: number,
): Promise<FilaExportacion> {
  const fichero = Bun.file(ruta);
  const bytes = fichero.size;
  if (bytes <= 0) throw new ErrorMontaje(500, "El vídeo montado ha salido vacío, así que no se ha guardado.");
  if (bytes > LIMITE_BYTES.video) {
    throw new ErrorMontaje(
      413,
      `El vídeo montado pesa ${formatearTamano(bytes)} y el máximo por archivo de la biblioteca es ${formatearTamano(LIMITE_BYTES.video)}. Recorta el montaje y vuelve a exportarlo.`,
    );
  }
  const archivo = new File([await fichero.arrayBuffer()], "montaje.mp4", { type: "video/mp4" });
  const medio = await crearMedio(actor, archivo, { duracion }, ["video"], null);
  const [cerrada] = await db()
    .update(montageExports)
    .set({
      state: "listo",
      stage: "listo",
      progress: 100,
      resultMediaId: medio.id,
      durationSeconds: duracion,
      sizeBytes: medio.tamano,
      errorMessage: "",
      finishedAt: new Date(),
      lockedBy: null,
      lockedUntil: null,
    })
    .where(and(eq(montageExports.id, exportacion.id), isNull(montageExports.resultMediaId)))
    .returning();
  if (cerrada) return cerrada;
  await enviarAPapelera(actor, medio.id)
    .then(() => eliminarDefinitivamente(actor, medio.id))
    .catch((error) => console.error(`[montaje] exportación duplicada sin borrar (${medio.id}):`, error));
  const [vigente] = await db().select().from(montageExports).where(eq(montageExports.id, exportacion.id)).limit(1);
  if (!vigente) throw new ErrorMontaje(404, "Esa exportación ya no existe.");
  return vigente;
}
