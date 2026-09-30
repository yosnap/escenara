/**
 * Comunidad (RF10): tipos y textos que comparten el servidor y la interfaz. Solo se publica **contenido sintético**
 * (decisión del propietario, 2026-09-30): personajes inventados, clips y ejemplos de trends y plantillas hechos con
 * ellos. Nunca fotos reales, personajes con fotos reales ni nada con una persona real.
 */

export const TIPOS_PUBLICACION = ["personaje", "clip", "trend", "plantilla"] as const;
export type TipoPublicacion = (typeof TIPOS_PUBLICACION)[number];
export type EstadoPublicacion = "pendiente" | "aprobada" | "rechazada";

export const esTipoPublicacion = (v: unknown): v is TipoPublicacion =>
  typeof v === "string" && (TIPOS_PUBLICACION as readonly string[]).includes(v);

export const ETIQUETA_TIPO: Record<TipoPublicacion, string> = {
  personaje: "Personaje",
  clip: "Clip",
  trend: "Trend",
  plantilla: "Plantilla",
};

export const ETIQUETA_ESTADO: Record<EstadoPublicacion, string> = {
  pendiente: "Pendiente de moderación",
  aprobada: "Publicada",
  rechazada: "Rechazada",
};

/** La declaración expresa que el autor marca al publicar. Se guarda con su texto exacto y la fecha. */
export const DECLARACION_PUBLICAR =
  "Confirmo que es contenido sintético (sin fotos, voces ni lugares reales de ninguna persona) y quiero publicarlo en la comunidad.";

export const TITULO_MAXIMO = 80;
export const DESCRIPCION_MAXIMA = 600;
export const FIRMA_MAXIMA = 40;
export const MOTIVO_MINIMO = 10;
export const MOTIVO_MAXIMO = 500;
/** Tope de imágenes que se copian de un personaje: su retrato y unas pocas vistas bastan para enseñarlo. */
export const MAXIMO_IMAGENES_PERSONAJE = 4;

/** Normas de publicación de fábrica. Quien administra las edita en Admin › Ajustes › Comunidad. */
export const NORMAS_POR_DEFECTO = [
  "Solo contenido sintético: personajes inventados y lo que hagas con ellos. Nunca fotos reales ni personas reales.",
  "Nada de marcas, productos ni lugares reales fotografiados: la galería solo admite lo generado de principio a fin.",
  "Sin desnudos, violencia, odio ni nada que parezca un menor en situaciones adultas.",
  "Lo que publicas lo ve toda la instalación cuando se aprueba. Puedes retirarlo cuando quieras: se borra la copia.",
  "Quien modera puede rechazar o retirar una publicación con un motivo escrito que verás tú.",
].join("\n");

export const ruta = {
  medio: (publicacionId: string, posicion: number) =>
    `/api/comunidad/publicaciones/${publicacionId}/medios/${posicion}`,
};

export interface MedioPublicado {
  url: string;
  tipo: "imagen" | "video";
  ancho: number | null;
  alto: number | null;
  alt: string;
}

/** Lo que ve cualquier usuario de una publicación aprobada. Lista blanca de campos: nada más sale del servidor. */
export interface PublicacionVista {
  id: string;
  tipo: TipoPublicacion;
  titulo: string;
  descripcion: string;
  firma: string;
  medios: MedioPublicado[];
  /** Trend o plantilla de la instalación con el que se hizo (solo `trend` y `plantilla`): su nombre, nunca su texto. */
  plantilla: { id: string; nombre: string } | null;
  reto: { id: string; titulo: string } | null;
  publicadaEl: string | null;
  usos: number;
}

/** Lo que ve el autor de su propia publicación, además de lo público: su estado y el motivo del rechazo. */
export interface MiPublicacionVista extends PublicacionVista {
  estado: EstadoPublicacion;
  motivoRechazo: string;
  revision: number;
  /** El original ya no existe: la publicación no se ve y el worker la borra. */
  huerfana: boolean;
}

export interface Elegibilidad {
  publicable: boolean;
  /** Por qué no se puede publicar, en lenguaje llano. Vacío si se puede. */
  motivos: string[];
}

/** Lo que ve quien modera: la publicación con su vista previa y la elegibilidad comprobada otra vez. */
export interface PublicacionEnModeracion extends MiPublicacionVista {
  esDeQuienModera: boolean;
  elegibilidad: Elegibilidad;
}

export interface CandidatoAPublicar {
  origen: { tipo: "personaje" | "medio"; id: string };
  nombre: string;
  /** Texto de partida para la descripción (la del personaje); el autor lo revisa antes de publicar. */
  descripcionSugerida: string;
  /** Miniatura del original (ruta del propio usuario), si la hay. */
  miniatura: { url: string; tipo: "imagen" | "video" } | null;
  tipos: TipoPublicacion[];
  plantilla: { id: string; nombre: string; tipo: "trend" | "plantilla" } | null;
  elegibilidad: Elegibilidad;
  publicacion: { id: string; estado: EstadoPublicacion } | null;
}

export interface RetoVista {
  id: string;
  titulo: string;
  descripcion: string;
  desde: string;
  hasta: string;
  vigente: boolean;
  plantilla: { id: string; nombre: string } | null;
  participaciones: number;
}

export const LOGROS = [
  { clave: "primer_personaje", titulo: "Primer personaje", descripcion: "Has creado tu primer personaje." },
  {
    clave: "primera_escena_aprobada",
    titulo: "Primera escena aprobada",
    descripcion: "Has aprobado la primera escena de un proyecto.",
  },
  { clave: "primera_exportacion", titulo: "Primera exportación", descripcion: "Has exportado tu primer vídeo." },
  {
    clave: "primera_publicacion_aprobada",
    titulo: "Primera publicación aprobada",
    descripcion: "La comunidad ya ve algo tuyo.",
  },
] as const;
export type ClaveLogro = (typeof LOGROS)[number]["clave"];
export const esClaveLogro = (v: unknown): v is ClaveLogro => typeof v === "string" && LOGROS.some((l) => l.clave === v);

export interface LogroVista {
  clave: ClaveLogro;
  titulo: string;
  descripcion: string;
  conseguidoEl: string | null;
  /** Conseguido y todavía sin celebrar: el confeti sale una vez. */
  porCelebrar: boolean;
}

/** Texto de una fecha para las tarjetas, en la zona de Madrid. */
export const fechaCorta = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeZone: "Europe/Madrid" }).format(new Date(iso)) : "";
