/**
 * Lógica pura de la copia de un personaje **inventado** a la cuenta de demostración. Sin base de datos ni
 * almacenamiento: el script `preparar-personaje-demo.ts` lee las filas, esta parte decide qué se copia y cómo
 * queda, y el script lo escribe. Así cada regla se prueba sin servicios.
 *
 * Tres reglas que no se negocian:
 *
 * - solo se copian personajes inventados con su declaración sintética vigente: la cara de una persona o de un
 *   animal reales no sale de la cuenta que tiene su consentimiento;
 * - la copia es de la cuenta de destino entera: medios con claves de almacenamiento nuevas, filas con
 *   identificadores nuevos y ninguna referencia a usuarios de la cuenta original;
 * - repetirla no duplica: si la copia ya está completa se deja igual, y si está a medias se reemplaza conservando
 *   su identificador, que es el que citan las capturas.
 */
import { GUIA_ESTILO_VACIA } from "@/lib/animados";
import type {
  characterApprovals,
  characterOmniRegistrations,
  characterReferences,
  characters,
  characterVersions,
  consentRecords,
  FilaAprobacion,
  FilaConsentimiento,
  FilaMedio,
  FilaPersonaje,
  FilaReferencia,
  FilaRegistroOmni,
  FilaVersionPersonaje,
  NuevoMedio,
  projects,
} from "../src/server/db/esquema";

export type FilaProyecto = typeof projects.$inferSelect;

/** Todo lo que se lee de la cuenta original para copiar un personaje. */
export interface OrigenPersonaje {
  personaje: FilaPersonaje;
  consentimientos: FilaConsentimiento[];
  referencias: FilaReferencia[];
  versiones: FilaVersionPersonaje[];
  registros: FilaRegistroOmni[];
  aprobaciones: FilaAprobacion[];
  /** Los medios de `idsDeMedios` más las hojas marcadas con `character_sheet_of` del personaje. */
  medios: FilaMedio[];
  /** Proyecto en modo Omni cuya voz se citó en el registro más reciente; `null` si no hay. */
  proyectoOmni: FilaProyecto | null;
}

export interface MedioACopiar {
  claveOrigen: string;
  fila: NuevoMedio & { id: string; storageKey: string };
}

export interface PlanDeCopia {
  personaje: typeof characters.$inferInsert & { id: string };
  medios: MedioACopiar[];
  consentimientos: (typeof consentRecords.$inferInsert)[];
  referencias: (typeof characterReferences.$inferInsert)[];
  versiones: (typeof characterVersions.$inferInsert & { id: string })[];
  registros: (typeof characterOmniRegistrations.$inferInsert)[];
  aprobaciones: (typeof characterApprovals.$inferInsert)[];
  /** Proyecto Omni de la cuenta de destino, sin escenas: da la voz con la que la ficha dice que se registró. */
  proyecto: (typeof projects.$inferInsert & { title: string }) | null;
}

export interface OpcionesPlan {
  destinoId: string;
  /** Identificador que tendrá la copia: el de la copia anterior al reemplazar, para no romper las capturas. */
  personajeId: string;
  /** Identificador del proyecto Omni de destino: el existente si ya hay uno, para no duplicarlo. */
  proyectoId: string;
  ahora: Date;
  nuevoId: () => string;
}

/** Título del proyecto Omni de la cuenta de destino. Es también la clave con la que se reutiliza. */
export const tituloProyectoDemo = (nombre: string) => `Demo · ${nombre} en escenas habladas`;

/**
 * Por qué no se puede copiar este personaje, o `null` si se puede. Un personaje real se reconoce por cualquiera
 * de estas señales, y basta una: no es inventado, su consentimiento vigente no es «inventado» con la declaración
 * sintética, tiene un documento de consentimiento o alguna referencia es una foto original.
 */
export function motivoParaNoCopiar(origen: OrigenPersonaje, destinoId: string): string | null {
  const { personaje } = origen;
  if (personaje.ownerId === destinoId) return "El personaje ya es de la cuenta de destino: no hay nada que copiar.";
  if (!personaje.virtual) {
    return `«${personaje.name}» es una persona o un animal reales: solo se copian personajes inventados.`;
  }
  const vigentes = origen.consentimientos.filter((c) => c.revokedAt === null);
  const vigente = vigentes[0];
  if (vigentes.length !== 1 || !vigente) {
    return `«${personaje.name}» no tiene una declaración vigente de personaje inventado.`;
  }
  if (vigente.holderType !== "inventado" || !vigente.syntheticDeclared) {
    return `«${personaje.name}» no está declarado como inventado: solo se copian personajes sintéticos.`;
  }
  if (origen.consentimientos.some((c) => c.documentMediaId !== null)) {
    return `«${personaje.name}» tiene un documento de consentimiento: es material de una persona real.`;
  }
  if (origen.referencias.some((r) => r.origin === "foto_original")) {
    return `«${personaje.name}» tiene fotos originales entre sus referencias: solo se copian imágenes generadas.`;
  }
  return null;
}

/** Medios que necesita la ficha completa: cara, vistas, hojas, retratos registrados y fotograma maestro. */
export function idsDeMedios(origen: Omit<OrigenPersonaje, "medios" | "proyectoOmni" | "aprobaciones">): string[] {
  const ids = new Set<string>();
  const anadir = (id: string | null | undefined) => {
    if (id) ids.add(id);
  };
  anadir(origen.personaje.masterFrameMediaId);
  anadir(origen.personaje.identitySheetMediaId);
  for (const r of origen.referencias) anadir(r.mediaId);
  for (const v of origen.versiones) {
    anadir(v.sheetMediaId);
    for (const id of v.referenceMediaIds) anadir(id);
  }
  for (const r of origen.registros) {
    anadir(r.portraitMediaId);
    anadir(r.bodyMediaId);
  }
  for (const c of origen.consentimientos) anadir(c.documentMediaId);
  return [...ids];
}

/** Clave de almacenamiento nueva con la misma extensión, en la carpeta del mes como las subidas normales. */
export function claveNueva(claveOrigen: string, uuid: string, ahora: Date): string {
  const nombre = claveOrigen.split("/").pop() ?? "";
  const punto = nombre.lastIndexOf(".");
  const extension = punto > 0 ? nombre.slice(punto + 1).toLowerCase() : "bin";
  const mes = String(ahora.getUTCMonth() + 1).padStart(2, "0");
  return `media/${ahora.getUTCFullYear()}/${mes}/${uuid}.${/^[a-z0-9]{1,8}$/.test(extension) ? extension : "bin"}`;
}

/** Lo que identifica a una versión ante el proveedor: el texto de la ficha y el conjunto de imágenes. */
function identidadDe(version: FilaVersionPersonaje): string {
  const { sheet } = version;
  const ficha = {
    rasgos: sheet.rasgos,
    estilo: sheet.estilo,
    vestuario: sheet.vestuario,
    personalidad: sheet.personalidad,
    voz: sheet.voz,
    descripcion: sheet.descripcion,
    renderStyle: sheet.renderStyle ?? "realista",
    styleGuide: { ...GUIA_ESTILO_VACIA, ...(sheet.styleGuide ?? {}) },
  };
  const imagenes = version.referenceMediaIds.map((id, i) => `${id}:${version.referenceViewKeys[i] ?? ""}`).sort();
  return JSON.stringify([ficha, imagenes]);
}

/**
 * Versión a la que queda unido un registro en la copia. Es la misma que en el original salvo cuando la versión
 * vigente es **la misma identidad** que la registrada (mismo texto de ficha y mismas imágenes, solo reordenadas):
 * entonces se une a la vigente, porque lo que el proveedor tiene guardado es exactamente esa cara. Si la ficha o
 * las imágenes cambiaron, se conserva tal cual y la ficha de la copia pedirá registrarlo otra vez, como el original.
 */
export function versionDelRegistro(versiones: FilaVersionPersonaje[], registro: FilaRegistroOmni): string {
  const registrada = versiones.find((v) => v.id === registro.characterVersionId);
  const vigente = versiones.reduce<FilaVersionPersonaje | null>(
    (mayor, v) => (mayor === null || v.number > mayor.number ? v : mayor),
    null,
  );
  if (!registrada || !vigente || registro.supersededAt !== null) return registro.characterVersionId;
  return identidadDe(registrada) === identidadDe(vigente) ? vigente.id : registro.characterVersionId;
}

/** Construye todas las filas de la copia. Lanza si el origen no se puede copiar o le falta un medio. */
export function planificarCopia(origen: OrigenPersonaje, opciones: OpcionesPlan): PlanDeCopia {
  const motivo = motivoParaNoCopiar(origen, opciones.destinoId);
  if (motivo) throw new Error(motivo);
  const { destinoId, personajeId, ahora, nuevoId } = opciones;
  const fuente = origen.personaje;

  // La lista de imágenes de una versión antigua puede citar un medio ya borrado: es historia y no hace falta para
  // mostrar la ficha. Todo lo demás (claves ajenas) tiene que existir.
  const sinHistoria = { ...origen, versiones: origen.versiones.map((v) => ({ ...v, referenceMediaIds: [] })) };
  const presentes = new Set(origen.medios.map((m) => m.id));
  const faltan = idsDeMedios(sinHistoria).filter((id) => !presentes.has(id));
  if (faltan.length > 0) throw new Error(`Faltan ${faltan.length} medios del personaje en la base de datos.`);

  const medios: MedioACopiar[] = origen.medios.map((m) => {
    const id = nuevoId();
    return {
      claveOrigen: m.storageKey,
      fila: {
        id,
        ownerId: destinoId,
        kind: m.kind,
        storageKey: claveNueva(m.storageKey, nuevoId(), ahora),
        originalName: m.originalName,
        mimeType: m.mimeType,
        sizeBytes: m.sizeBytes,
        width: m.width,
        height: m.height,
        durationSeconds: m.durationSeconds,
        sourceUrl: m.sourceUrl,
        title: m.title,
        altEs: m.altEs,
        altEn: m.altEn,
        isDocument: m.isDocument,
        characterSheetOf: m.characterSheetOf === fuente.id ? personajeId : null,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
        deletedAt: m.deletedAt,
      },
    };
  });
  const medioNuevo = new Map(origen.medios.map((m, i) => [m.id, medios[i]?.fila.id ?? m.id]));
  const medioObligatorio = (id: string) => {
    const nuevo = medioNuevo.get(id);
    if (!nuevo) throw new Error("Una referencia cita un medio que no se ha copiado.");
    return nuevo;
  };
  const medio = (id: string | null) => (id === null ? null : medioObligatorio(id));

  const versionNueva = new Map(origen.versiones.map((v) => [v.id, nuevoId()]));
  const version = (id: string) => {
    const nueva = versionNueva.get(id);
    if (!nueva) throw new Error("Un registro o una aprobación citan una versión que no es de este personaje.");
    return nueva;
  };

  return {
    personaje: {
      ...fuente,
      id: personajeId,
      ownerId: destinoId,
      masterFrameMediaId: medio(fuente.masterFrameMediaId),
      identitySheetMediaId: medio(fuente.identitySheetMediaId),
    },
    medios,
    consentimientos: origen.consentimientos.map((c) => ({
      ...c,
      id: nuevoId(),
      characterId: personajeId,
      documentMediaId: null,
      registeredBy: c.registeredBy === null ? null : destinoId,
      reviewedBy: c.reviewedBy === null ? null : destinoId,
    })),
    referencias: origen.referencias.map((r) => ({
      ...r,
      id: nuevoId(),
      characterId: personajeId,
      mediaId: medioObligatorio(r.mediaId),
    })),
    versiones: origen.versiones.map((v) => ({
      ...v,
      id: version(v.id),
      characterId: personajeId,
      // No es clave ajena: un medio que ya no existe se queda con su identificador, que no resuelve a nada.
      referenceMediaIds: v.referenceMediaIds.map((id) => medioNuevo.get(id) ?? id),
      sheetMediaId: medio(v.sheetMediaId),
      createdBy: v.createdBy === null ? null : destinoId,
    })),
    registros: origen.registros.map((r) => ({
      ...r,
      id: nuevoId(),
      characterId: personajeId,
      characterVersionId: version(versionDelRegistro(origen.versiones, r)),
      portraitMediaId: medio(r.portraitMediaId),
      bodyMediaId: medio(r.bodyMediaId),
      registeredBy: r.registeredBy === null ? null : destinoId,
    })),
    aprobaciones: origen.aprobaciones.map((a) => ({
      ...a,
      id: nuevoId(),
      characterId: personajeId,
      characterVersionId: version(a.characterVersionId),
      invalidatedByVersionId: a.invalidatedByVersionId === null ? null : version(a.invalidatedByVersionId),
      approvedBy: a.approvedBy === null ? null : destinoId,
    })),
    proyecto: origen.proyectoOmni
      ? {
          id: opciones.proyectoId,
          userId: destinoId,
          title: tituloProyectoDemo(fuente.name),
          format: origen.proyectoOmni.format,
          mainCharacterId: personajeId,
          renderStyle: origen.proyectoOmni.renderStyle,
          voiceMode: "omni",
          omniVoice: origen.proyectoOmni.omniVoice,
          omniVoiceDescription: origen.proyectoOmni.omniVoiceDescription,
          omniVoiceExample: origen.proyectoOmni.omniVoiceExample,
          omniAudioId: origen.proyectoOmni.omniAudioId,
          omniVoiceSetAt: origen.proyectoOmni.omniVoiceSetAt,
          speechAccent: origen.proyectoOmni.speechAccent,
        }
      : null,
  };
}

/** Recuento de lo que tiene un personaje: con él se decide si la copia está completa. */
export interface Recuento {
  referencias: number;
  versiones: number;
  registros: number;
  consentimientos: number;
  medios: number;
}

/** Estado de una copia anterior en la cuenta de destino. */
export interface EstadoCopia {
  id: string;
  inventado: boolean;
  recuento: Recuento;
  /** Medios que cita la copia y no son de la cuenta de destino o no existen: la copia no es válida. */
  mediosAjenos: number;
  /** Trabajos, escenas o publicaciones que la usan: reemplazarla los dejaría sin su personaje. */
  usos: number;
}

export type Accion = { tipo: "crear" } | { tipo: "dejar"; id: string } | { tipo: "reemplazar"; id: string };

/**
 * Qué hacer con la cuenta de destino. Lanza cuando reemplazar rompería algo: el nombre lo usa un personaje que
 * no es inventado (no es una copia de este script) o la copia ya se ha usado para producir.
 */
export function decidirAccion(origen: Recuento, copia: EstadoCopia | null, forzar = false): Accion {
  if (!copia) return { tipo: "crear" };
  if (!copia.inventado) {
    throw new Error("La cuenta de destino ya tiene un personaje real con ese nombre: no se toca.");
  }
  const completa =
    copia.mediosAjenos === 0 &&
    (Object.keys(origen) as (keyof Recuento)[]).every((k) => origen[k] === copia.recuento[k]);
  if (completa && !forzar) return { tipo: "dejar", id: copia.id };
  if (copia.usos > 0) {
    throw new Error(
      `La copia de destino se ha usado en ${copia.usos} trabajos, escenas o publicaciones: no se reemplaza. Bórrala a mano si de verdad hay que rehacerla.`,
    );
  }
  return { tipo: "reemplazar", id: copia.id };
}

/** Recuento del origen, con el mismo criterio que el de la copia. */
export function recuentoDe(origen: OrigenPersonaje): Recuento {
  return {
    referencias: origen.referencias.length,
    versiones: origen.versiones.length,
    registros: origen.registros.length,
    consentimientos: origen.consentimientos.length,
    medios: origen.medios.length,
  };
}

/** Argumentos del script. La cuenta de destino es obligatoria; el personaje, «Elisa» si no se indica. */
export function leerArgumentos(argv: string[]): { personaje: string; destino: string; forzar: boolean } {
  const conocidas = new Set(["--personaje", "--destino", "--reemplazar"]);
  const valor = (nombre: string): string | null => {
    const i = argv.indexOf(nombre);
    if (i < 0) return null;
    const siguiente = argv[i + 1]?.trim();
    if (!siguiente || siguiente.startsWith("--")) throw new Error(`${nombre} necesita un valor.`);
    return siguiente;
  };
  const desconocida = argv.find((a) => a.startsWith("--") && !conocidas.has(a));
  if (desconocida) throw new Error(`Opción desconocida: ${desconocida}.`);
  const destino = valor("--destino");
  if (!destino) throw new Error("Indica la cuenta de destino con --destino (identificador o correo).");
  return { personaje: valor("--personaje") ?? "Elisa", destino, forzar: argv.includes("--reemplazar") };
}
