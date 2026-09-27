import type { Medio } from "./media/tipos";

/**
 * Personajes y consentimiento tal como los ven el servidor y el navegador (RF02 y RF10). Aquí no hay nada
 * que dependa de una credencial ni de la base de datos: solo la forma de los datos, sus límites y los
 * textos legales que se muestran igual en las dos partes.
 *
 * Regla dura de la versión: **un personaje sin consentimiento vigente no genera nada**. Lo decide
 * `server/personajes/puede-generar.ts` y lo comprueba `/crear` antes de encolar, no la interfaz.
 */

export const TIPOS_PERSONAJE = ["persona", "animal"] as const;
export type TipoPersonaje = (typeof TIPOS_PERSONAJE)[number];

export const esTipoPersonaje = (v: unknown): v is TipoPersonaje => TIPOS_PERSONAJE.includes(v as TipoPersonaje);

export const ETIQUETA_TIPO_PERSONAJE: Record<TipoPersonaje, string> = {
  persona: "Persona",
  animal: "Animal",
};

/**
 * Estado del personaje:
 *
 * - `borrador`: se está montando (le faltan referencias, consentimiento o las dos cosas);
 * - `en_revision`: el consentimiento es de un tercero y espera que lo acepte quien administra;
 * - `listo`: consentimiento vigente y referencias suficientes; es el único estado que genera;
 * - `bloqueado`: el consentimiento se ha revocado o se ha rechazado en la revisión.
 */
export const ESTADOS_PERSONAJE = ["borrador", "en_revision", "listo", "bloqueado"] as const;
export type EstadoPersonaje = (typeof ESTADOS_PERSONAJE)[number];

export const esEstadoPersonaje = (v: unknown): v is EstadoPersonaje => ESTADOS_PERSONAJE.includes(v as EstadoPersonaje);

export const ETIQUETA_ESTADO_PERSONAJE: Record<EstadoPersonaje, string> = {
  borrador: "Borrador",
  en_revision: "En revisión",
  listo: "Listo",
  bloqueado: "Bloqueado",
};

export const DESCRIPCION_ESTADO_PERSONAJE: Record<EstadoPersonaje, string> = {
  borrador: "Le falta consentimiento o referencias. Todavía no se puede usar para generar.",
  en_revision: "El consentimiento es de otra persona y espera la revisión de quien administra la instalación.",
  listo: "Consentimiento vigente y referencias suficientes: se puede usar para generar.",
  bloqueado: "El consentimiento se ha revocado o se ha rechazado. No se puede generar con este personaje.",
};

/** Quién es el titular de la imagen que se va a usar. Es lo que decide cuánta fricción hay. */
export const TITULARES_CONSENTIMIENTO = ["yo", "tercero", "animal_propio"] as const;
export type TitularConsentimiento = (typeof TITULARES_CONSENTIMIENTO)[number];

export const esTitularConsentimiento = (v: unknown): v is TitularConsentimiento =>
  TITULARES_CONSENTIMIENTO.includes(v as TitularConsentimiento);

export const ETIQUETA_TITULAR: Record<TitularConsentimiento, string> = {
  yo: "Soy yo",
  tercero: "Otra persona",
  animal_propio: "Un animal mío",
};

export const DESCRIPCION_TITULAR: Record<TitularConsentimiento, string> = {
  yo: "Las fotos son tuyas y apareces tú. Basta con tu declaración, que queda registrada con tu cuenta y la fecha.",
  tercero:
    "Aparece otra persona. Hace falta subir su documento de consentimiento firmado, y el personaje queda en revisión hasta que quien administra esta instalación lo acepte.",
  animal_propio: "Es un animal tuyo. Basta con tu declaración, que queda registrada con tu cuenta y la fecha.",
};

/** El titular `tercero` es el único que exige documento firmado y revisión humana. */
export const exigeDocumento = (titular: TitularConsentimiento) => titular === "tercero";

/** Para qué se autoriza el uso de la imagen. El uso comercial se declara aparte a propósito. */
export const ALCANCES_USO = ["personal", "comercial"] as const;
export type AlcanceUso = (typeof ALCANCES_USO)[number];

export const esAlcanceUso = (v: unknown): v is AlcanceUso => ALCANCES_USO.includes(v as AlcanceUso);

export const ETIQUETA_ALCANCE: Record<AlcanceUso, string> = {
  personal: "Uso personal",
  comercial: "Uso comercial",
};

export const DESCRIPCION_ALCANCE: Record<AlcanceUso, string> = {
  personal: "Contenido para ti o para tu entorno, sin promocionar ni vender nada.",
  comercial: "Contenido para promocionar o vender algo. Exige que el titular lo autorice expresamente.",
};

/** De dónde sale una referencia: una foto real del usuario o una vista generada antes con el personaje. */
export const ORIGENES_REFERENCIA = ["foto_original", "vista_generada"] as const;
export type OrigenReferencia = (typeof ORIGENES_REFERENCIA)[number];

export const esOrigenReferencia = (v: unknown): v is OrigenReferencia =>
  ORIGENES_REFERENCIA.includes(v as OrigenReferencia);

export const ETIQUETA_ORIGEN_REFERENCIA: Record<OrigenReferencia, string> = {
  foto_original: "Foto original",
  vista_generada: "Vista generada",
};

export const NOMBRE_MAXIMO = 80;
export const DESCRIPCION_MAXIMA = 1000;
export const ESPECIE_MAXIMA = 120;
export const VISTA_MAXIMA = 60;
export const MOTIVO_MAXIMO = 500;

/** Tope de referencias por personaje. No es el del modelo: es lo que la ficha admite guardar. */
export const MAXIMO_REFERENCIAS = 20;

/** Tope de personajes por usuario: evita que una cuenta llene la instalación de fichas vacías. */
export const MAXIMO_PERSONAJES = 100;

/**
 * Texto legal que se muestra en la zona de claridad del consentimiento y que se acepta al registrarlo.
 * Está aquí, y no en la plantilla, para que el servidor y el navegador digan exactamente lo mismo.
 */
export const AVISO_MAYORIA_DE_EDAD =
  "Declaro que la persona que aparece en las fotos es mayor de edad. Escenara no puede comprobar la edad de nadie: esta declaración es un control, no una garantía, y responder en falso es tu responsabilidad.";

export const AVISO_SIN_TERCEROS =
  "Antes de enviar las fotos al proveedor, confirma que en ellas no aparece ninguna otra persona ni ningún menor. Las referencias se suben al almacenamiento temporal del proveedor, donde quedan accesibles por enlace unas horas.";

export const AVISO_CONTROL_NO_GARANTIA =
  "Este registro es un control del producto, no una verificación. Escenara no comprueba identidades ni edades: guarda tu declaración con tu cuenta y la fecha, y quien administra la instalación revisa los documentos de terceros.";

/** Referencia de un personaje tal como la devuelve la API. El medio lleva su URL temporal firmada. */
export interface ReferenciaVista {
  id: string;
  medio: Medio;
  origen: OrigenReferencia;
  /** Vista declarada por el usuario («de frente», «perfil izquierdo»…); vacío si no la ha indicado. */
  vista: string;
  orden: number;
}

/** Registro de consentimiento tal como lo devuelve la API. Nunca lleva datos de otro usuario. */
export interface ConsentimientoVista {
  id: string;
  titular: TitularConsentimiento;
  /** Declaración de mayoría de edad, obligatoria para registrar. */
  mayoriaDeEdad: boolean;
  alcance: AlcanceUso;
  /** Documento firmado del tercero; `null` cuando el titular no lo exige. */
  documento: Medio | null;
  registradoEn: string;
  /** Fecha de la revisión de quien administra, o `null` si no se ha revisado. */
  revisadoEn: string | null;
  /** `true` si la revisión aceptó el documento, `false` si lo rechazó, `null` si no se ha revisado. */
  aceptado: boolean | null;
  revocadoEn: string | null;
  motivoRevocacion: string | null;
  /** `true` cuando el consentimiento está aceptado (o no necesita revisión) y sin revocar. */
  vigente: boolean;
}

/** Personaje tal como lo devuelve la API. `referencias` y `consentimiento` solo van en la ficha. */
export interface PersonajeVista {
  id: string;
  nombre: string;
  tipo: TipoPersonaje;
  /** Especie o notas del animal; en personas se usa para matices («gemela de…»). */
  especie: string;
  descripcion: string;
  estado: EstadoPersonaje;
  /** Cuántas referencias tiene guardadas. */
  totalReferencias: number;
  /** Mínimo de referencias que exige esta instalación para poder generar. */
  minimoReferencias: number;
  /** `true` si se puede usar en «Crear» ahora mismo. */
  puedeGenerar: boolean;
  /** Por qué no se puede generar, en lenguaje llano. Vacío si se puede. */
  impedimentos: string[];
  /** Primera referencia, para la miniatura de la lista; `null` si aún no tiene ninguna o no es tuyo. */
  portada: Medio | null;
  /**
   * `false` cuando quien pregunta no es el dueño (quien administra, revisando un consentimiento). La interfaz
   * no muestra acciones que el servidor va a rechazar; lo que decide sigue siendo el servidor.
   */
  puedeEditar: boolean;
  creadoEn: string;
  actualizadoEn: string;
  /** Solo para el dueño: las fotos del personaje no salen nunca en una respuesta a otra persona. */
  referencias?: ReferenciaVista[];
  consentimiento?: ConsentimientoVista | null;
  /** Solo en la vista de administración: quién es el dueño del personaje. */
  propietario?: { id: string; nombre: string };
}

/** Lo que el selector de «Crear» necesita saber de un personaje. */
export interface PersonajeElegible {
  id: string;
  nombre: string;
  tipo: TipoPersonaje;
  estado: EstadoPersonaje;
  totalReferencias: number;
  portada: Medio | null;
}

/** Qué se va a borrar al borrar un personaje, para poder enumerarlo antes de confirmar. */
export interface ResumenBorradoPersonaje {
  nombre: string;
  /** Relaciones con medios de la biblioteca que se deshacen (las fotos siguen en la biblioteca). */
  referencias: number;
  /** Medios generados con este personaje que se borrarán del almacenamiento. */
  derivados: number;
  /** Trabajos de generación hechos con este personaje. */
  trabajos: number;
  /**
   * Trabajos que ya están en el proveedor. Con uno solo, el borrado se rechaza (409): su tarea existe, se va a
   * cobrar y su resultado va a llegar. Hay que esperar a que terminen.
   */
  trabajosEnMarcha: number;
  /** Trabajos que aún no han salido y se cancelarán liberando su reserva. */
  trabajosPorCancelar: number;
  /** `true` si hay un documento de consentimiento; se conserva en la biblioteca como prueba. */
  conDocumento: boolean;
}
