import type { EvaluacionVista } from "@/lib/controles";
import type { DireccionElegidaConAcento, OpcionesDeDireccion } from "@/lib/direccion";
import type { Deposito, EstadoCola, Estimacion, TipoTrabajo, TrabajoVista } from "@/lib/generacion";
import type { ProductoElegido } from "@/lib/productos";

/** Cliente de la API de generación para el navegador. */

/**
 * `red: true` marca los fallos en los que **no se sabe** si la petición llegó al servidor. Importa al
 * enviar una generación: puede haberse encargado ya, así que no se invita a repetir sin más.
 */
export type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string; red?: boolean };

/**
 * Un fallo de red al enviar no dice si el trabajo se encargó o no: se avisa de eso en lugar de invitar a repetir.
 * Volver a pulsar reenvía la misma confirmación (misma clave), así que tampoco se paga dos veces.
 */
export const mensajeDeFallo = (respuesta: Resultado<unknown> & { ok: false }) =>
  respuesta.red
    ? `${respuesta.error} Puede que el trabajo se haya enviado: revisa el historial antes de repetirlo.`
    : respuesta.error;

async function pedir<T>(url: string, init?: RequestInit): Promise<Resultado<T>> {
  try {
    const respuesta = await fetch(url, init);
    const cuerpo = await respuesta.json().catch(() => null);
    if (!respuesta.ok) {
      return { ok: false, error: cuerpo?.error ?? "No se ha podido completar la operación." };
    }
    return { ok: true, datos: cuerpo as T };
  } catch {
    return { ok: false, error: "Sin conexión con el servidor.", red: true };
  }
}

const json = (cuerpo: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(cuerpo),
});

interface Confirmacion {
  prompt: string;
  /** Modelo elegido en el catálogo. */
  modelo: string;
  /** Sello del precio con el que se hizo la estimación: si ha cambiado, el servidor rechaza el envío. */
  selloEstimacion: string;
  creditosConfirmados: number;
  derechos: boolean;
  /** Casilla «tengo derecho a usar esta marca»: el servidor la exige en cuanto el envío lleva producto. */
  derechoMarca: boolean;
  avisoUmbralAceptado: boolean;
  /** La misma confirmación lleva siempre la misma clave: repetirla no genera un segundo trabajo. */
  claveIdempotencia: string;
  /** Avisos «Necesita ajustes» confirmados expresamente, por su clave de regla (0.18.0). */
  avisosConfirmados: string[];
  /**
   * Versión de la ficha del personaje que se estaba mirando al confirmar. Si el servidor usaría otra, responde
   * 409 y hay que volver a revisar el contexto: la ficha entra en el prompt.
   */
  versionPersonaje?: string;
}

export interface ConfirmacionFotograma extends Confirmacion {
  tipo: "fotograma";
  /**
   * Producto elegido (0.26.0). En el fotograma cuenta porque un producto **digital** empieza aquí: este
   * fotograma es el del dispositivo con la pantalla apagada.
   */
  producto?: ProductoElegido;
  /** `insertar_captura` convierte este envío en el segundo paso: la captura dentro de esa pantalla. */
  pasoDigital?: "insertar_captura";
  /** Imagen suelta de la biblioteca; alternativa a `personajeId`. */
  medioId?: string;
  /** Personaje elegido: se le envían **varias** referencias suyas, hasta el tope del modelo. */
  personajeId?: string;
  /** Revisión de referencias (ADR-0009): en las fotos no aparece ningún tercero ni ningún menor. */
  sinTerceros?: boolean;
}

export interface ConfirmacionAnimacion extends Confirmacion {
  tipo: "animacion";
  /** Fotograma ya generado que se anima. Alternativa a `medioId`: hace falta uno de los dos. */
  trabajoPadreId?: string;
  /**
   * Imagen de la biblioteca que se anima **directamente**, sin generar ningún fotograma antes (0.25.1). Que sea
   * tuya lo comprueba el servidor: una ajena responde 404.
   */
  medioId?: string;
  /**
   * Dirección del clip: **claves del catálogo**, nunca texto de prompt. El servidor las traduce con su catálogo
   * y compone el prompt, que no sale hacia aquí (ADR-0022).
   */
  direccion?: DireccionElegidaConAcento;
  /**
   * Producto del clip: el identificador de uno **tuyo** y la clave de la acción del catálogo. Que sea tuyo lo
   * comprueba el servidor; uno ajeno responde 404.
   */
  producto?: ProductoElegido;
  /**
   * Duración del clip que se ha confirmado, en segundos. Es la de la estimación que se tenía delante: cada
   * duración es una tarifa distinta del modelo, y lo que se paga es esta.
   */
  segundos?: number;
  /** Lo que dice el personaje: solo el clip tiene voz. */
  dialogo: string;
  /**
   * Revisión de referencias (ADR-0009). Obligatoria cuando el fotograma se hizo con un personaje: el clip
   * envía la misma cara al proveedor, así que es otro envío y necesita su propia confirmación.
   */
  sinTerceros?: boolean;
}

/** Envía la generación. `creditosConfirmados` son los créditos que el usuario tenía delante. */
export const crearTrabajo = (peticion: ConfirmacionFotograma | ConfirmacionAnimacion) =>
  pedir<TrabajoVista>("/api/generacion/trabajos", json(peticion));

/**
 * Catálogo de la dirección del clip: plano, ángulo, óptica, luz, sitio, cámara y micro-acción en castellano y
 * **sin su fragmento en inglés** (ADR-0022). Es una lectura: no encola nada.
 */
export const consultarCatalogoDeDireccion = () => pedir<OpcionesDeDireccion>("/api/direccion");

export const consultarTrabajo = (id: string) => pedir<TrabajoVista>(`/api/generacion/trabajos/${id}`);

/** «Volver a consultar»: reconcilia con el identificador de tarea guardado, sin reenviar nada. */
export const reconsultarTrabajo = (id: string) =>
  pedir<TrabajoVista>(`/api/generacion/trabajos/${id}/consultar`, { method: "POST" });

/** Cancela un trabajo que aún no ha salido hacia el proveedor. Uno ya enviado responde 409. */
export const cancelarTrabajo = (id: string) =>
  pedir<TrabajoVista>(`/api/generacion/trabajos/${id}/cancelar`, { method: "POST" });

/** Autoriza un tope de créditos para un trabajo cuyo coste no se podía acotar, y lo encola. */
export const autorizarLimite = (id: string, creditos: number) =>
  pedir<TrabajoVista>(`/api/generacion/trabajos/${id}/limite`, json({ creditos }));

/** Estado de la cola y depósito de presupuesto de quien pregunta. */
export const consultarCola = () => pedir<{ cola: EstadoCola; deposito: Deposito }>("/api/generacion/cola");

/**
 * Estado de los controles previos: qué diría el servidor si generaras ahora (0.18.0). Es una lectura: no
 * encola nada ni mueve presupuesto.
 */
export const consultarControles = (peticion: {
  tipo: TipoTrabajo;
  modelo?: string;
  personajeId?: string;
  medioId?: string;
  escenaId?: string;
  productoId?: string;
  accion?: string;
  /** Fotos del producto elegidas para enviar. Vacío = las de por defecto. */
  fotos?: string[];
  /** Lugar elegido en «Crear»: su declaración, su acabado y si su maestra cabe. */
  lugarId?: string;
  /** Segundo paso del producto digital: meter la captura en la pantalla. */
  paso?: "insertar_captura";
}) => {
  const parametros = new URLSearchParams({ tipo: peticion.tipo });
  if (peticion.fotos?.length) parametros.set("fotos", peticion.fotos.join(","));
  for (const clave of [
    "modelo",
    "personajeId",
    "medioId",
    "escenaId",
    "productoId",
    "accion",
    "lugarId",
    "paso",
  ] as const) {
    const valor = peticion[clave];
    if (valor) parametros.set(clave, valor);
  }
  return pedir<EvaluacionVista>(`/api/generacion/controles?${parametros}`);
};

/**
 * Estimación del modelo indicado (sin modelo, el del mapa del usuario).
 *
 * `sinImagen` pide la del modelo que genera **sin imagen de partida** y `segundos`, la de esa duración
 * concreta: las dos cambian el modelo o la tarifa, así que la estimación se vuelve a pedir al servidor en
 * lugar de calcularla aquí. Nunca se muestra un coste que no haya dicho el servidor.
 */
export const consultarEstimacion = (
  tipo: TipoTrabajo,
  modelo?: string,
  opciones: { sinImagen?: boolean; segundos?: number; plantillaId?: string } = {},
) => {
  const parametros = new URLSearchParams({ tipo });
  if (modelo) parametros.set("modelo", modelo);
  if (opciones.sinImagen) parametros.set("sinImagen", "1");
  if (opciones.segundos !== undefined) parametros.set("segundos", String(opciones.segundos));
  if (opciones.plantillaId) parametros.set("plantillaId", opciones.plantillaId);
  return pedir<Estimacion>(`/api/generacion/estimacion?${parametros}`);
};

/** Las cuatro C que se pueden leer de una foto. La identidad no está: sale de las referencias del personaje. */
export interface SeisCExtraidas {
  camara: string;
  ropa: string;
  contexto: string;
  luz: string;
}

/** Lo que devuelve la lectura: campos revisables y el aviso de los que no se han podido leer. */
export interface ExtraccionVista {
  campos: SeisCExtraidas;
  /** Campos que el modelo no supo leer, escrito para el usuario. Vacío si los leyó todos. */
  aviso: string;
  /** Siempre `false`: confirmar es pulsar el botón, no una respuesta del servidor. */
  confirmada: boolean;
}

/**
 * Lee las 6C de una foto del usuario. **No cuesta créditos** (se paga con la cuota de su plan) y **no genera
 * nada**: devuelve campos para que los revise.
 */
export const extraerCamposDeFoto = (medioId: string, confirmoEnvio: boolean) =>
  pedir<ExtraccionVista>("/api/direccion/extraer", json({ medioId, confirmoEnvio }));
