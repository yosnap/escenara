import type { EstadoControl } from "@/lib/controles";
import type { TipoTrabajoCola } from "@/lib/generacion";

/**
 * Contrato del motor de controles previos (RF12, 0.18.0): los **hechos** que se le dan y los **frenos** que
 * devuelve.
 *
 * El motor es determinista y puro: recibe hechos ya cargados y no consulta nada. Todo lo que hace falta leer
 * lo lee `hechos.ts` **antes**, para que la misma evaluación sirva para pintar el panel «Antes de generar»
 * (lectura, sin mover un céntimo) y para cerrar la puerta del encolado.
 */

/** Versión del conjunto de reglas activo; vive en `lib/controles.ts` porque también se muestra (RF13). */
export { REGLAS_VERSION } from "@/lib/controles";

/**
 * Qué se está evaluando. Una escena del plan de un proyecto, un envío suelto de «Crear» o, desde la 0.32.0, el
 * **montaje** de un proyecto que se va a exportar.
 */
export const SUJETOS_CONTROL = ["escena", "trabajo", "montaje"] as const;
export type SujetoControl = (typeof SUJETOS_CONTROL)[number];

/**
 * Qué se iba a hacer, para el registro de la evaluación. Los tres tipos de trabajo de la cola, más `montaje`
 * (0.32.0), que **no** es un trabajo de la cola de proveedores: no cuesta créditos y no sale de la máquina, pero
 * pasa por el mismo motor de reglas, así que su evaluación se guarda igual.
 */
export type TipoEvaluado = TipoTrabajoCola | "montaje";

/** Tipo de excepción con la que se rechaza el envío, para no cambiar los códigos ni las clases de 0.10.0–0.17.0. */
export type FamiliaError = "generacion" | "proyecto" | "personaje";

/** Un freno del motor: por qué no se puede generar (o qué conviene arreglar) y qué hay que hacer. */
export interface Freno {
  /** Clave estable de la regla. Es lo que el usuario confirma cuando el aviso es salvable. */
  regla: string;
  estado: Exclude<EstadoControl, "listo">;
  /** Por qué, en lenguaje llano. Nunca vacío. */
  motivo: string;
  /** Qué hacer. Nunca vacío. */
  accion: string;
  /** Ruta de la aplicación donde se arregla; `null` si no hay una concreta. */
  enlace?: string | null;
  /** Código HTTP con el que se rechaza el envío. */
  http: number;
  excepcion: FamiliaError;
  /**
   * `true` cuando el usuario puede salvar el aviso confirmándolo expresamente. Solo puede serlo un freno
   * `ajustes`: el motor lo comprueba y nunca marca como confirmable un `revision` ni un `bloqueado`
   * (decisión provisional del propietario, 2026-09-27).
   */
  confirmable?: boolean;
  /**
   * `false` en los avisos que **solo informan** y no cierran ninguna puerta. Hoy solo uno: el coste que no se
   * puede acotar, porque desde 0.12.0 el trabajo ya se encola como `esperando_limite` y no sale hasta que el
   * usuario fija su techo. Ese paso **es** la acción del aviso; pedir además una casilla no añadiría nada.
   */
  gatea?: boolean;
}

/** Freno con todos sus campos resueltos: es lo que guarda y devuelve el motor. */
export interface FrenoResuelto extends Required<Omit<Freno, "enlace">> {
  enlace: string | null;
}

export interface Evaluacion {
  estado: EstadoControl;
  reglasVersion: string;
  frenos: FrenoResuelto[];
}

// ── Hechos ────────────────────────────────────────────────────────────────────────────────────────────────

/** Estado de la credencial del usuario en el proveedor del modelo elegido. */
export interface HechosCredencial {
  nombreProveedor: string;
  /** `false` cuando el proveedor del modelo todavía no puede cobrar con la clave del usuario (ADR-0009). */
  proveedorAdmitido: boolean;
  /** Motivo por el que la credencial no sirve, o `null` si sirve. */
  motivo: "boveda" | "sin-credencial" | "invalida" | "ilegible" | null;
  /** Saldo de créditos en el proveedor; `null` cuando no se ha podido consultar (entonces no se bloquea). */
  saldo: number | null;
}

/** Modelo elegido y su precio, reducidos a lo que deciden las reglas. */
export interface HechosModelo {
  nombre: string;
  /** Fotos de referencia que admite; 0 = no admite ninguna. */
  maximoReferencias: number;
  /** Fecha (AAAA-MM-DD) en la que se comprobó su precio. */
  precioComprobado: string;
  /** El precio se comprobó hace más de {@link DIAS_PRECIO_FRESCO} días. */
  precioCaducado: boolean;
  /** El coste máximo del trabajo se puede acotar con el precio registrado (PRD §6). */
  costeAcotado: boolean;
  /** Por qué no se puede acotar; vacío cuando sí se puede. */
  motivoSinAcotar: string;
}

/** Personaje con el que se genera, si se genera con uno. */
export interface HechosPersonaje {
  nombre: string;
  /** Impedimentos duros (consentimiento y mínimo de referencias), tal como los deduce `personajes/estado.ts`. */
  impedimentos: string[];
  /** Vistas mínimas sin ninguna foto original suya. */
  vistasSinCubrir: string[];
  /** Fotos de referencia que el control de calidad señaló y el usuario añadió «de todas formas». */
  referenciasSenaladas: number;
  /** El envío genera una vista que le falta: completa la cobertura, así que no se le avisa de que falta. */
  completaCobertura?: boolean;
}

/** Dinero: lo que cuesta el envío frente a los tres techos que existen. */
export interface HechosPresupuesto {
  /** Créditos totales del envío (generación más traducción, si esta instalación traduce). */
  creditos: number;
  topeTrabajo: number | null;
  /** Créditos que le quedan libres al usuario; `null` = sin presupuesto propio en esta instalación. */
  disponibleUsuario: number | null;
  /** Parte del presupuesto del usuario que está retenida y no se libera sola, con en qué está. */
  retenidoUsuario: number;
  trabajosEnRevision: number;
  llamadasDeTextoColgadas: number;
  /** Revisiones con modelo que se quedaron con su coste apartado (RF07). */
  revisionesColgadas: number;
  /** Techo del proyecto; `null` cuando el envío no pertenece a un proyecto o el proyecto no tiene techo. */
  autorizadoProyecto: number | null;
  comprometidoProyecto: number;
}

/** Espacio de la biblioteca: el resultado tiene que caber antes de pagarlo. */
export interface HechosCuota {
  /** Bytes que hay que reservar para el peor caso del tipo de resultado. */
  previstoBytes: number;
  /** Bytes libres; `null` = sin cuota. */
  libresBytes: number | null;
}

/** Escena del plan que se produce, si el envío pertenece a un proyecto. */
export interface HechosEscena {
  planAprobado: boolean;
  /** `false` cuando la escena está en borrador (nunca aprobada o invalidada). */
  aprobada: boolean;
  /** Por qué dejó de estar aprobada, tal como se lo guardó el proyecto. Vacío si nunca lo estuvo. */
  motivoInvalidacion: string;
  /** Lo congelado al aprobar ya no coincide con lo vigente. */
  precioCambiado: boolean;
  fichaCambiada: boolean;
  plantillaCambiada: boolean;
  /** Afirmaciones de la escena que siguen `por_verificar`. */
  afirmacionesPorVerificar: number;
  /**
   * `true` cuando la escena tiene guion escrito y su formato es **voz en off** (0.25.0): el clip saldrá mudo y
   * lo que el usuario escribió no se le enviará al modelo.
   *
   * Es un aviso **confirmable y no un freno**: montar la narración encima es un camino legítimo. Pero es
   * dinero, y gastarlo en un clip sin la voz que uno ha escrito sin que nadie lo diga es justo lo que la norma
   * de errores visibles prohíbe.
   */
  guionEnClipMudo: boolean;
}

/**
 * Revisión de continuidad del proyecto que se va a **exportar** (RF07, 0.20.0).
 *
 * Este grupo de hechos solo llega cuando lo que se evalúa es una exportación: las escenas que mantienen un fallo
 * crítico abierto, con el motivo de cada una. Producir una escena no lo aporta, porque un crítico de otra escena no
 * puede impedir seguir trabajando; lo que impide es **publicar el resultado**.
 *
 * El recuento sale de un solo sitio (`revision/resultados.ts › criticosAbiertosDeProyecto`), así que la pantalla de
 * revisión y esta puerta no pueden decir cosas distintas.
 */
export interface HechosExportacion {
  /** Escenas con un crítico abierto, por su número de orden y con su motivo en lenguaje llano. */
  criticos: { orden: number; motivo: string }[];
  /**
   * Fragmentos de la línea de tiempo del montaje (0.32.0). `undefined` cuando lo que se evalúa no es un montaje
   * —la exportación de subtítulos, por ejemplo—, y entonces la regla del material no se evalúa.
   */
  fragmentos?: number;
  /**
   * Escenas del montaje que ya no tienen clip guardado, por su número de orden (0.32.0). Sin material no hay
   * nada que montar, y el mensaje tiene que decir **cuál** falta.
   */
  escenasSinClip?: number[];
}

/**
 * Identidad hablada registrada en el proveedor (modo `omni`, 0.22.0). Este grupo **solo llega cuando el proyecto
 * está en ese modo**: en los demás no hay nada que registrar y la regla no se evalúa.
 *
 * Es la única regla nueva del motor en 0.22.0. Las otras dos del alcance de la fase —un personaje inventado no
 * admite fotos reales y su texto no puede nombrar a personas reales— se aplican **donde se puede hacer algo con
 * ellas**, al añadir la foto y al guardar la ficha (`personajes/inventado.ts`): un personaje inventado con una
 * foto real no llega a existir, así que una regla aquí no podría saltar nunca.
 */
export interface HechosOmni {
  /** `true` cuando el protagonista está registrado con la voz vigente del proyecto. */
  registrado: boolean;
  /** Qué falta exactamente, en llano. Vacío cuando no falta nada. */
  falta: string;
}

/**
 * Producto que se presenta en el envío (0.26.0). Este grupo **solo llega cuando hay producto**; sin él no hay
 * nada que avisar y ninguna de sus reglas se evalúa.
 *
 * Los tres avisos que salen de aquí son de los que cuestan dinero si nadie los dice: se pierde la identidad
 * registrada, no caben todas las referencias o el filtro del proveedor puede rechazar una marca. Los tres son
 * **salvables**: el usuario los confirma y sigue, que es su decisión, no la nuestra.
 */
export interface HechosProducto {
  nombre: string;
  /** El producto no tiene ninguna foto que enviar, así que el modelo no sabe qué aspecto tiene. */
  sinFotos: boolean;
  /** El tope de referencias del modelo deja fuera fotos del personaje o del producto. */
  referenciasNoCaben: boolean;
  /**
   * El producto tiene fotos y en este modelo **no cabe ninguna**: su segunda imagen no es una galería (en Veo
   * es el último fotograma del clip). El producto viajaría solo descrito con palabras.
   */
  sinHuecoDeReferencia: boolean;
  /** Modelos de la misma capacidad en los que sí cabe la foto del producto. Solo se rellena si hace falta. */
  modelosConFoto: string[];
  /** La acción elegida es de las que hoy salen mal a menudo (las de piel). */
  pocoFiable: boolean;
  /** El nombre en castellano de la acción elegida: es el que el usuario leyó en el botón. */
  nombreAccion: string;
  /**
   * `true` cuando llevar el producto obliga a renunciar a la identidad registrada en el proveedor: sus
   * referencias y su `character_ids` son excluyentes, así que la cara y la voz pasan a salir de las fotos.
   */
  identidadRegistradaPerdida: boolean;
  /** El usuario declaró que en el producto se ve una marca. Decide el aviso del filtro del proveedor. */
  marcaVisible: boolean;
}

/** Parámetros de las reglas, editables en Admin › Ajustes (no hay editor de reglas en la interfaz). */
export interface ParametrosControles {
  /** Avisar cuando falten vistas mínimas del personaje o haya fotos señaladas por calidad. */
  exigirCoberturaVistas: boolean;
  /** Avisar cuando el precio del modelo se comprobó hace más de 90 días. */
  exigirPrecioFresco: boolean;
  /** Tope de avisos salvables que se pueden confirmar de una vez; pasado ese número, hay que arreglar algo. */
  maximoAvisos: number;
}

/**
 * Hechos que evalúa el motor.
 *
 * Todos los grupos salvo `tipo` y `parametros` son opcionales, y una regla cuyo grupo de hechos **no está**
 * no se evalúa. Eso permite una sola función de evaluación para dos usos honestos: la puerta del encolado, que
 * aporta **todos** los grupos, y la mirada a una escena del plan, donde todavía no hay ni modelo elegido ni
 * coste que comparar.
 *
 * Para que «no está» no pueda convertirse nunca en un pase gratis, la puerta
 * ({@link exigirControles}) exige que estén **todos** los grupos antes de dejar encolar y falla con 500 si
 * falta alguno: olvidarse de un grupo es un error de programación, no una configuración.
 */
export interface Hechos {
  tipo: TipoEvaluado;
  credencial?: HechosCredencial;
  modelo?: HechosModelo;
  /** `null` cuando el envío no lleva personaje (imagen suelta de 0.10.0); ausente = no se evalúa. */
  personaje?: HechosPersonaje | null;
  presupuesto?: HechosPresupuesto;
  cuota?: HechosCuota;
  /** `null` en el camino rápido de «Crear», que no pertenece a ningún proyecto (ADR-0021). */
  escena?: HechosEscena | null;
  /**
   * Revisión de continuidad del proyecto que se exporta (0.20.0). Ausente en todo lo que **no** es una
   * exportación, que es todo lo de 0.10.0–0.19.1: un crítico abierto no impide producir ni regenerar.
   */
  exportacion?: HechosExportacion;
  /**
   * Identidad hablada registrada (0.22.0). Ausente en todo lo que no es una escena de un proyecto en modo `omni`,
   * que es todo lo de 0.10.0–0.21.1.
   */
  omni?: HechosOmni;
  /**
   * Producto que se presenta (0.26.0). Ausente cuando el envío no lleva ninguno, que es todo lo anterior a
   * esta versión y la mayoría de los clips.
   */
  producto?: HechosProducto;
  parametros: ParametrosControles;
}

/** Grupos que la puerta del encolado exige tener resueltos. */
export const GRUPOS_OBLIGATORIOS = ["credencial", "modelo", "personaje", "presupuesto", "cuota", "escena"] as const;
