import type { Cobertura, IdentidadReferencia, MotivoRechazo, RechazoDeReferencia, Vista } from "./captura-personaje";
import type { EstadoHojaIdentidad } from "./direccion";
import type { DiferenciaFicha, FichaPersonaje } from "./ficha-personaje";
import type { Medio } from "./media/tipos";
import type { RegistroOmniVista } from "./omni";

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
export const TITULARES_CONSENTIMIENTO = ["yo", "tercero", "animal_propio", "inventado"] as const;
export type TitularConsentimiento = (typeof TITULARES_CONSENTIMIENTO)[number];

export const esTitularConsentimiento = (v: unknown): v is TitularConsentimiento =>
  TITULARES_CONSENTIMIENTO.includes(v as TitularConsentimiento);

export const ETIQUETA_TITULAR: Record<TitularConsentimiento, string> = {
  yo: "Soy yo",
  tercero: "Otra persona",
  animal_propio: "Un animal mío",
  inventado: "Un personaje inventado",
};

export const DESCRIPCION_TITULAR: Record<TitularConsentimiento, string> = {
  yo: "Las fotos son tuyas y apareces tú. Basta con tu declaración, que queda registrada con tu cuenta y la fecha.",
  tercero:
    "Aparece otra persona. Hace falta subir su documento de consentimiento firmado, y el personaje queda en revisión hasta que quien administra esta instalación lo acepte.",
  animal_propio: "Es un animal tuyo. Basta con tu declaración, que queda registrada con tu cuenta y la fecha.",
  inventado:
    "No existe: nace de una descripción y su cara se genera. No hay ninguna persona a la que pedir permiso, así que no hay documento que subir ni mayoría de edad que declarar; lo que se registra es que es inventado y no representa a nadie real. No admite fotos de personas.",
};

/**
 * Titulares que se pueden **elegir al registrar** un consentimiento. `inventado` queda fuera: no se registra
 * sobre un personaje que ya existe, sino que nace con él (`/personajes/nuevo/inventado`), y ofrecerlo aquí
 * permitiría marcar como inventado a uno que sí tiene fotos de alguien.
 */
export const TITULARES_REGISTRABLES = TITULARES_CONSENTIMIENTO.filter((t) => t !== "inventado");

/** El titular `tercero` es el único que exige documento firmado y revisión humana. */
export const exigeDocumento = (titular: TitularConsentimiento) => titular === "tercero";

/**
 * El titular `inventado` (0.22.0) es el único que **no** declara mayoría de edad: no hay ninguna persona cuya edad
 * declarar. Lo que declara en su lugar es que el personaje no representa a nadie real, y esa declaración es
 * obligatoria y se guarda con la cuenta y la fecha.
 */
export const esInventado = (titular: TitularConsentimiento) => titular === "inventado";

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

/**
 * Para qué se aprobó algo con un personaje. La base de las aprobaciones de guion y escenas (0.17.0) y de la
 * revisión de continuidad (0.20.0): aquí solo se registran y se **invalidan** al cambiar la ficha.
 */
export const TIPOS_APROBACION = ["guion", "escena", "continuidad"] as const;
export type TipoAprobacion = (typeof TIPOS_APROBACION)[number];

export const esTipoAprobacion = (v: unknown): v is TipoAprobacion => TIPOS_APROBACION.includes(v as TipoAprobacion);

export const ETIQUETA_TIPO_APROBACION: Record<TipoAprobacion, string> = {
  guion: "Guion",
  escena: "Escena",
  continuidad: "Continuidad",
};

/** Qué hay que hacer con una aprobación invalidada. Una invalidación sin acción concreta solo confunde. */
export const ACCION_APROBACION_INVALIDA: Record<TipoAprobacion, string> = {
  guion: "Vuelve a revisar el guion con la ficha nueva y apruébalo otra vez.",
  escena: "Vuelve a revisar la escena: se aprobó con una apariencia que ya no es la vigente.",
  continuidad: "Repite la revisión de continuidad: las referencias o la ficha han cambiado.",
};

export const NOMBRE_MAXIMO = 80;
export const DESCRIPCION_MAXIMA = 1000;
export const ESPECIE_MAXIMA = 120;
export const VISTA_MAXIMA = 60;
export const MOTIVO_MAXIMO = 500;
/** Motivo del cambio de ficha: una línea que explique por qué existe esta versión. */
export const MOTIVO_CAMBIO_MAXIMO = 200;
/** Asunto de una aprobación («escena 3», «guion del anuncio»). */
export const ASUNTO_APROBACION_MAXIMO = 120;

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

/**
 * Qué sale de Escenara hacia el proveedor cuando se genera con este personaje. Se dice **en el consentimiento**,
 * porque no son solo las fotos: **el texto de su ficha también se procesa en KIE** (entra en el prompt y, si la
 * instalación traduce los prompts al inglés, pasa además por su modelo de texto).
 */
export const AVISO_DATOS_AL_PROVEEDOR =
  "Al generar con este personaje se envían a KIE sus fotos de referencia y el texto de su ficha (rasgos, estilo, vestuario, personalidad y descripción), que forma parte del prompt. Si esta instalación traduce los prompts al inglés, ese texto pasa además por el modelo de texto de KIE, y su traducción se guarda con tu cuenta hasta que borres el personaje.";

/**
 * Lo que hay que declarar para que la comprobación de identidad de 0.24.0 pueda mirar la cara de esta persona.
 *
 * Va aparte del resto y **no se deduce de ninguna otra declaración**: comprobar si una vista generada es la misma
 * persona obliga a mandar dos fotos suyas a un servicio que **no es** el que genera, y un consentimiento firmado
 * para producir vídeo no dice nada de eso. Sin esta casilla no se envía nada y las vistas generadas no cuentan
 * para la cobertura, que es exactamente lo que pasaba hasta la 0.23.x.
 */
export const AVISO_COHERENCIA =
  "Autorizo que, para comprobar que lo generado sigue siendo esta misma persona y encaja con el guion, se envíen al servicio de percepción configurado en esta instalación (hoy, un servicio compatible con la API de OpenAI que tú mismo has dado de alta) dos fotos suyas, el fotograma aprobado de sus escenas y hasta 30 segundos de la voz de sus clips. De ahí solo sale una descripción escrita, que es lo que se compara. Sin esta autorización la comprobación no se hace y sus vistas generadas no cuentan como fotos de referencia.";

export const AVISO_CONTROL_NO_GARANTIA =
  "Este registro es un control del producto, no una verificación. Escenara no comprueba identidades ni edades: guarda tu declaración con tu cuenta y la fecha, y quien administra la instalación revisa los documentos de terceros.";

/** Referencia de un personaje tal como la devuelve la API. El medio lleva su URL temporal firmada. */
export interface ReferenciaVista {
  id: string;
  medio: Medio;
  /**
   * De dónde sale. `vista_generada` viaja hasta la interfaz y se muestra **siempre** con su distintivo: una
   * vista generada no se presenta nunca como foto.
   */
  origen: OrigenReferencia;
  /** Vista declarada por el usuario («de frente», «perfil izquierdo»…); vacío si no la ha indicado. */
  vista: string;
  /** Vista del catálogo de cobertura (0.14.0); `null` si la foto no está clasificada. */
  vistaClave: Vista | null;
  /** Medidas del control de calidad; `null` en las referencias anteriores a 0.14.0. */
  calidad: { ancho: number; alto: number; nitidez: number | null; luminosidad: number | null } | null;
  /**
   * Motivos por los que el control de calidad la marcó, si se añadió «de todas formas». Vacío si pasó limpia;
   * van **todos**, no solo el primero: una foto puede estar a la vez borrosa y oscura.
   */
  motivosMarcada: MotivoRechazo[];
  /**
   * Veredicto de la comprobación de identidad (0.24.0). Solo dice algo en una `vista_generada`; en una foto
   * original es siempre `sin_comprobar`, porque es ella la que define la cara y no hay nada que comparar.
   */
  identidad: IdentidadReferencia;
  /** Por qué, escrito para el usuario. Vacío mientras no se haya comprobado. */
  identidadMotivo: string;
  orden: number;
}

/** Registro de consentimiento tal como lo devuelve la API. Nunca lleva datos de otro usuario. */
export interface ConsentimientoVista {
  id: string;
  titular: TitularConsentimiento;
  /** Declaración de mayoría de edad, obligatoria para registrar. */
  mayoriaDeEdad: boolean;
  /** Autorización para la comprobación de identidad (0.24.0). `false` en todo lo anterior a esa versión. */
  coherenciaDeclarada: boolean;
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

/** Aprobación dependiente de una versión del personaje, tal como la devuelve la API. */
export interface AprobacionVista {
  id: string;
  tipo: TipoAprobacion;
  /** Qué se aprobó, en palabras del usuario («escena 3», «guion del anuncio»). */
  asunto: string;
  /** Número de la versión con la que se aprobó. */
  versionNumero: number;
  aprobadaEn: string;
  /** `true` cuando una versión posterior la ha invalidado: hay que volver a revisarla. */
  invalidada: boolean;
  invalidadaEn: string | null;
  /** Qué la invalidó, en lenguaje llano. Vacío si sigue vigente. */
  motivoInvalidacion: string;
  /** Número de la versión que la invalidó, si la invalidó una. */
  invalidadaPorVersion: number | null;
}

/** Versión de la ficha de un personaje tal como la devuelve la API. */
export interface VersionPersonajeVista {
  id: string;
  numero: number;
  ficha: FichaPersonaje;
  descripcion: string;
  /** Cuántas referencias incluía esta versión. */
  totalReferencias: number;
  /** Hoja de personaje de esta versión (montaje de sus referencias); `null` si no se ha compuesto. */
  hoja: Medio | null;
  /** Motivo del cambio que escribió el usuario; vacío en la primera versión. */
  motivo: string;
  /** Qué cambió respecto a la anterior. Vacío en la primera. */
  diferencias: DiferenciaFicha[];
  /** Cuántas aprobaciones quedaron invalidadas al crearla. */
  aprobacionesInvalidadas: number;
  /** Bloque de contexto que esta versión añade al prompt; vacío si la ficha está sin rellenar. */
  contexto: string;
  creadaEn: string;
  /** `true` en la versión con la que se genera ahora mismo. */
  vigente: boolean;
}

/** Historial de versiones de un personaje con sus aprobaciones. */
export interface HistorialVersiones {
  versiones: VersionPersonajeVista[];
  aprobaciones: AprobacionVista[];
}

/**
 * Lo que se le enseña al usuario **antes de confirmar**: el contexto que se añadirá al prompt y qué
 * referencias se enviarán, con la versión que las cita. Es una lectura: no mueve dinero ni encola nada.
 */
export interface ContextoAplicado {
  personajeId: string;
  nombre: string;
  versionId: string;
  versionNumero: number;
  /**
   * `true` si la ficha aporta algo al prompt. **El texto no viaja** (ADR-0022): el prompt compuesto no sale hacia
   * el navegador de un usuario normal, así que aquí solo se dice si la ficha está aportando contexto o si está
   * vacía, que es la única parte que el usuario puede arreglar.
   */
  conContexto: boolean;
  /** Referencias que se enviarán, ya elegidas por cobertura y recortadas al tope del modelo. */
  referencias: { medioId: string; vista: Vista | null; origen: OrigenReferencia; medio: Medio | null }[];
  /** Tope de referencias del modelo elegido. */
  maximoDelModelo: number;
  /** Modelo para el que se ha calculado. */
  modelo: string;
}

/** Personaje tal como lo devuelve la API. `referencias` y `consentimiento` solo van en la ficha. */
export interface PersonajeVista {
  id: string;
  nombre: string;
  tipo: TipoPersonaje;
  /** Especie o notas del animal; en personas se usa para matices («gemela de…»). */
  especie: string;
  descripcion: string;
  /**
   * Ficha de apariencia (0.15.0). Es lo que se añade al prompt como contexto, así que cambiarla crea una
   * versión nueva. Va siempre, también cuando está vacía: el formulario necesita los campos.
   */
  ficha: FichaPersonaje;
  /** Versión vigente de la ficha: la que se cita al generar. `null` solo mientras se está creando. */
  versionVigente: { id: string; numero: number; creadaEn: string; hoja: Medio | null } | null;
  estado: EstadoPersonaje;
  /**
   * `true` cuando es un personaje **inventado** (0.22.0): no existe, su cara se genera y no admite fotos reales.
   * La interfaz lo dice siempre y no ofrece subir fotos; quien lo impide es el servidor.
   */
  inventado: boolean;
  /** Acabado guardado para retratos, vistas y clips. Solo los inventados pueden ser animados. */
  estiloAnimado: string;
  /** Solo en la ficha del dueño: puede contener detalles privados de apariencia. */
  guiaEstilo?: { paleta: string; trazo: string; detalle: string; referencias: string[] };
  /** Retrato animado elegido y aprobado como ancla; `null` antes de elegirlo. */
  fotogramaMaestro: Medio | null;
  /**
   * `true` si este personaje **inventado** se describe con estética de modelo, porque el usuario lo ha pedido
   * expresamente. Siempre `false` en una persona real, donde ni se ofrece ni se aplica.
   */
  esteticaDeModelo: boolean;
  /** Hoja de identidad 3×3 del personaje, si la tiene generada; `null` si todavía no hay ninguna. */
  hojaIdentidad: { medioId: string; estado: EstadoHojaIdentidad } | null;
  /**
   * `true` si su dueño ha aceptado **probar la hoja** en la mitad de sus escenas. Desactivado de fábrica: la
   * prueba cambia lo que se genera y lo que se paga, así que la decide él.
   */
  probarHojaIdentidad: boolean;
  /**
   * Registro en el proveedor para escenas habladas (0.22.0); `null` si nunca se ha registrado. Dice con qué
   * versión de la ficha se hizo y si esa versión sigue siendo la vigente.
   */
  registroOmni?: RegistroOmniVista | null;
  /**
   * Cuántas **fotos originales** utilizables tiene. Las vistas generadas no se suman aquí: no cuentan para el
   * mínimo que exige la instalación (decisión 3 de la fase 14).
   */
  totalReferencias: number;
  /** Cuántas vistas generadas utilizables tiene, contadas aparte a propósito. */
  totalGeneradas: number;
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
  /**
   * Cobertura de vistas (0.14.0): qué vistas mínimas hay y cuál falta. Solo para el dueño, como las
   * referencias: dice cuántas fotos tiene y de qué ángulo.
   */
  cobertura?: Cobertura;
  consentimiento?: ConsentimientoVista | null;
  /** Solo en la vista de administración: quién es el dueño del personaje. */
  propietario?: { id: string; nombre: string };
}

/**
 * Respuesta de añadir referencias: el personaje recalculado y, si alguna foto no ha pasado el control de
 * calidad, cuáles y por qué. Si **ninguna** pasa, la respuesta es un 422 con el mismo detalle; si pasan unas y
 * otras no, se guardan las buenas y aquí se dice qué le ha pasado al resto, que es mejor que dejar al usuario
 * contando fotos para averiguar que falta una.
 */
export type ReferenciasAnadidas = PersonajeVista & { rechazos?: RechazoDeReferencia[] };

/** Lo que el selector de «Crear» necesita saber de un personaje. */
export interface PersonajeElegible {
  id: string;
  nombre: string;
  tipo: TipoPersonaje;
  estado: EstadoPersonaje;
  totalReferencias: number;
  portada: Medio | null;
  /**
   * Versión vigente de su ficha. Entra en la firma de la confirmación de «Crear»: si la ficha cambia entre
   * la pantalla y el botón, lo confirmado ya no es lo mismo y la clave de idempotencia se renueva.
   */
  versionNumero: number;
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
