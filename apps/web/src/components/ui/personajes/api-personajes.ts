import type { PropuestaDeFicha } from "@/lib/asistente-personaje";
import type { RechazoDeReferencia, Vista } from "@/lib/captura-personaje";
import type { EvaluacionVista } from "@/lib/controles";
import type { EstadoHojaIdentidad } from "@/lib/direccion";
import type { CampoFicha } from "@/lib/ficha-personaje";
import type { Estimacion, TrabajoVista } from "@/lib/generacion";
import type { Medio } from "@/lib/media/tipos";
import type {
  AprobacionVista,
  ContextoAplicado,
  HistorialVersiones,
  PersonajeVista,
  ReferenciasAnadidas,
  ResumenBorradoPersonaje,
  TipoAprobacion,
} from "@/lib/personajes";

/** Cliente de la API de personajes para el navegador. */

export type Resultado<T> =
  | { ok: true; datos: T }
  /**
   * `rechazos` llega del control de calidad de las referencias (422): dice qué foto falló y por qué.
   *
   * `red` marca los fallos en los que **no se sabe** si la petición llegó al servidor. Importa al pedir una
   * vista sintética: puede haberse encargado ya, así que no se invita a repetir sin más.
   */
  | { ok: false; error: string; rechazos?: RechazoDeReferencia[]; red?: boolean };

async function pedir<T>(url: string, init?: RequestInit): Promise<Resultado<T>> {
  try {
    const respuesta = await fetch(url, init);
    if (respuesta.status === 204) return { ok: true, datos: undefined as T };
    const cuerpo = await respuesta.json().catch(() => null);
    if (!respuesta.ok) {
      return {
        ok: false,
        error: cuerpo?.error ?? "No se ha podido completar la operación.",
        ...(Array.isArray(cuerpo?.rechazos) ? { rechazos: cuerpo.rechazos as RechazoDeReferencia[] } : {}),
      };
    }
    return { ok: true, datos: cuerpo as T };
  } catch {
    return { ok: false, error: "Sin conexión con el servidor.", red: true };
  }
}

const json = (metodo: string, cuerpo: unknown): RequestInit => ({
  method: metodo,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(cuerpo),
});

export interface DatosNuevoPersonaje {
  nombre: string;
  tipo: string;
  especie?: string;
  descripcion?: string;
}

export const listarPersonajes = () => pedir<PersonajeVista[]>("/api/personajes");

export const crearPersonaje = (datos: DatosNuevoPersonaje) =>
  pedir<PersonajeVista>("/api/personajes", json("POST", datos));

export const obtenerPersonaje = (id: string) => pedir<PersonajeVista>(`/api/personajes/${id}`);

export const editarPersonaje = (id: string, cambios: Partial<DatosNuevoPersonaje>) =>
  pedir<PersonajeVista>(`/api/personajes/${id}`, json("PATCH", cambios));

/** Cambios de la ficha de apariencia. Van con el motivo: es lo que explica por qué existe la versión nueva. */
export type CambiosFicha = Partial<Record<CampoFicha | "descripcion" | "motivo", string>> & {
  /** Estética de modelo, solo en inventados. No versiona la ficha: no cambia quién es. */
  esteticaDeModelo?: boolean;
  /** Probar la hoja 3×3 en la mitad de sus escenas. Tampoco versiona: no cambia quién es. */
  probarHojaIdentidad?: boolean;
  estiloAnimado?: string;
  guiaPaleta?: string;
  guiaTrazo?: string;
  guiaDetalle?: string;
  guiaReferencias?: string[];
};

/**
 * Guarda la ficha. El servidor decide si eso crea versión: si el texto es el mismo, no se gasta un número.
 * Devuelve el personaje recalculado, con su versión vigente.
 */
export const guardarFicha = (id: string, cambios: CambiosFicha) =>
  pedir<PersonajeVista>(`/api/personajes/${id}`, json("PATCH", cambios));

/** Historial de versiones con sus aprobaciones y qué se invalidó en cada una. */
export const listarVersiones = (id: string) => pedir<HistorialVersiones>(`/api/personajes/${id}/versiones`);

/** Registra una aprobación contra la versión vigente (base de 0.17.0 y 0.20.0). */
export const registrarAprobacion = (id: string, tipo: TipoAprobacion, asunto: string) =>
  pedir<AprobacionVista>(`/api/personajes/${id}/versiones`, json("POST", { tipo, asunto }));

/** Compone la hoja de personaje de la versión vigente. No cuesta créditos: la monta el servidor. */
export const generarHojaDePersonaje = (id: string) =>
  pedir<{ hoja: Medio; versionId: string; versionNumero: number }>(`/api/personajes/${id}/hoja`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

/**
 * Contexto que se añadirá al prompt y referencias que se enviarán con ese modelo. Es lo que se muestra
 * **antes de confirmar**: una lectura, sin coste y sin encolar nada.
 */
export const consultarContexto = (id: string, modelo?: string) =>
  pedir<ContextoAplicado>(`/api/personajes/${id}/contexto${modelo ? `?modelo=${encodeURIComponent(modelo)}` : ""}`);

/** Qué se borraría: referencias, trabajos y medios derivados. Se enumera antes de confirmar. */
export const consultarBorrado = (id: string) => pedir<ResumenBorradoPersonaje>(`/api/personajes/${id}?borrado=1`);

export const borrarPersonaje = (id: string) =>
  pedir<{ personaje: string; clavesBorradas: string[] }>(`/api/personajes/${id}`, { method: "DELETE" });

/**
 * Añade fotos de la biblioteca como referencias. `deTodasFormas` son las que el usuario ha aceptado usar
 * **aunque el control de calidad las haya marcado**: se marcan una por una y no en bloque, así que aceptar una
 * foto borrosa no cuela de rebote las demás.
 *
 * Es idempotente: las fotos que ya sean referencia del personaje se ignoran en el servidor, así que se puede
 * reenviar la tanda entera para salvar las que faltaban.
 */
export const anadirReferencias = (id: string, medioIds: string[], deTodasFormas: readonly string[] = []) =>
  pedir<ReferenciasAnadidas>(
    `/api/personajes/${id}/referencias`,
    json("POST", {
      referencias: medioIds.map((medioId) => ({
        medioId,
        ...(deTodasFormas.includes(medioId) ? { usarDeTodasFormas: true } : {}),
      })),
    }),
  );

/** Foto que se añade desde la captura guiada, con lo que midió el navegador y la vista que cubre. */
export interface ReferenciaGuiada {
  medioId: string;
  vistaClave?: Vista;
  /** Proporción de la cara que midió el navegador (0–1); se omite donde no hay detector. */
  caraRelativa?: number;
  /** El usuario ha aceptado añadirla aunque el control de calidad la haya marcado. */
  usarDeTodasFormas?: boolean;
}

/**
 * Añade fotos con su vista y sus medidas. El servidor vuelve a medirlas: lo que decide es él, no el
 * navegador, así que una respuesta 422 trae el detalle de cada foto en `rechazos`.
 */
export const anadirReferenciasGuiadas = (id: string, referencias: ReferenciaGuiada[]) =>
  pedir<ReferenciasAnadidas>(`/api/personajes/${id}/referencias`, json("POST", { referencias }));

/** Confirmación con la que se pide una vista sintética: las mismas reglas de dinero que «Crear». */
export interface ConfirmacionVistaSintetica {
  vista: Vista;
  creditosConfirmados: number;
  derechos: boolean;
  sinTerceros: boolean;
  avisoUmbralAceptado: boolean;
  claveIdempotencia: string;
  modelo?: string;
  selloEstimacion?: string;
  /** Claves de los avisos salvables que el usuario ha confirmado en «Antes de generar». */
  avisosConfirmados: string[];
}

/**
 * Coste estimado de un fotograma, que es lo que cuesta una vista sintética. Se pide **al abrir** el diálogo y
 * no al cargar la ficha: así ver un personaje no provoca una consulta de saldo al proveedor.
 */
export const consultarEstimacionDeVista = () => pedir<Estimacion>("/api/generacion/estimacion?tipo=fotograma");

/**
 * Estimación de un retrato de **personaje inventado** (0.23.4): nace de su descripción y no de ninguna foto,
 * así que lo genera un modelo de **texto a imagen** y su precio es el de ese modelo. Pedir aquí la del modelo
 * de edición enseñaría un coste y se enviaría otro.
 */
export const consultarEstimacionSinImagen = () =>
  pedir<Estimacion>("/api/generacion/estimacion?tipo=fotograma&sinImagen=1");

/**
 * «Antes de generar» de una vista que falta: lo mismo que dirá la puerta al encolarla, con sus avisos
 * confirmables. Es una lectura: no gasta nada.
 */
export const consultarControlesDeVista = (id: string, vista: Vista) =>
  pedir<EvaluacionVista>(
    `/api/generacion/controles?${new URLSearchParams({ tipo: "fotograma", personajeId: id, vista }).toString()}`,
  );

/**
 * Añade a un personaje **inventado** imágenes generadas con IA (en Escenara o fuera). Entran como imágenes
 * generadas, nunca como foto, y exigen la declaración de que no son de una persona real.
 */
export const anadirImagenesGeneradas = (id: string, medioIds: string[]) =>
  pedir<ReferenciasAnadidas>(
    `/api/personajes/${id}/referencias`,
    json("POST", {
      referencias: medioIds.map((medioId) => ({ medioId, usarDeTodasFormas: true })),
      generadasConIA: true,
    }),
  );

/** Lo que se confirma al encargar la hoja: es una generación como cualquier otra. */
export interface ConfirmacionHojaIdentidad {
  creditosConfirmados: number;
  derechos: boolean;
  /** «En estas fotos no aparece ninguna otra persona ni ningún menor»: la hoja envía sus fotos al proveedor. */
  sinTerceros: boolean;
  avisoUmbralAceptado: boolean;
  claveIdempotencia: string;
  modelo?: string;
  selloEstimacion?: string;
  avisosConfirmados: string[];
}

/** Encarga la hoja de identidad 3×3. Cuesta como un fotograma y pasa por el camino de dinero de siempre. */
export const generarHojaDeIdentidad = (id: string, confirmacion: ConfirmacionHojaIdentidad) =>
  pedir<{ trabajo: TrabajoVista; aviso: string }>(`/api/personajes/${id}/hoja-identidad`, json("POST", confirmacion));

/** Cambia el estado de la hoja: descartarla o hacerla la referencia por defecto del personaje. */
export const cambiarEstadoDeHoja = (id: string, estado: EstadoHojaIdentidad) =>
  pedir<PersonajeVista>(`/api/personajes/${id}/hoja-identidad`, json("PATCH", { estado }));

/** Controles previos de la hoja de identidad: los de un fotograma con las fotos del personaje. */
export const consultarControlesDeHoja = (id: string) =>
  pedir<EvaluacionVista>(
    `/api/generacion/controles?${new URLSearchParams({ tipo: "fotograma", personajeId: id }).toString()}`,
  );

/** Controles previos de los retratos candidatos de un personaje inventado: sin exigirle fotos que aún no tiene. */
export const consultarControlesDeRetrato = (id: string) =>
  pedir<EvaluacionVista>(
    `/api/generacion/controles?${new URLSearchParams({ tipo: "fotograma", personajeId: id, retrato: "1" }).toString()}`,
  );

/** Encola la generación de una vista que falta. La indicación al proveedor la escribe el servidor. */
export const pedirVistaSintetica = (id: string, confirmacion: ConfirmacionVistaSintetica) =>
  pedir<{ trabajo: TrabajoVista; vista: Vista }>(`/api/personajes/${id}/vista-sintetica`, json("POST", confirmacion));

/**
 * Encarga **todas las vistas que faltan** de una vez (0.22.1). Qué falta lo decide el servidor con la misma
 * regla que usa la pantalla para enseñar el coste total, así que el número que se confirma es el que se
 * encarga. Lo que no se pueda encolar vuelve en `sinEncolar` con su motivo, **sin cobrar**.
 */
export const pedirVistasQueFaltan = (id: string, confirmacion: Omit<ConfirmacionVistaSintetica, "vista">) =>
  pedir<VistasEncargadas>(`/api/personajes/${id}/vistas`, json("POST", confirmacion));

export interface VistasEncargadas {
  trabajos: TrabajoVista[];
  encoladas: Vista[];
  sinEncolar: { vista: Vista; etiqueta: string; motivo: string }[];
}

/**
 * Lo que costaría completar la ficha con IA y con qué modelo se haría. Es una lectura: no gasta nada y no
 * llama a ningún proveedor.
 */
export const consultarEstimacionDeFichaIA = (id: string) =>
  pedir<EstimacionDeTextoVista>(`/api/personajes/${id}/ficha-ia`);

/** Estimación de una llamada de texto por el mapa del usuario, tal como la devuelve el servidor. */
export interface EstimacionDeTextoVista {
  hayEntradas: boolean;
  motivo: string;
  creditos: number;
  /** `true` si ese servicio se paga por cuota del plan y no por petición: entonces no cuesta créditos. */
  porCuota: boolean;
  sello: string;
  nombreProveedor: string;
  modelo: string;
  admiteImagen: boolean;
}

/**
 * Pide al modelo de texto una propuesta de ficha. **No guarda nada**: lo que vuelve se revisa campo a campo y
 * se acepta con `guardarFicha`, que es la edición de siempre y crea versión.
 */
export const proponerFichaConIA = (
  id: string,
  confirmacion: { claveIdempotencia: string; creditosConfirmados?: number; selloEstimacion?: string },
) => pedir<PropuestaDeFicha>(`/api/personajes/${id}/ficha-ia`, json("POST", confirmacion));

export const quitarReferencias = (id: string, ids: string[]) =>
  pedir<PersonajeVista>(`/api/personajes/${id}/referencias`, json("DELETE", { ids }));

export const ordenarReferencias = (id: string, ids: string[]) =>
  pedir<PersonajeVista>(`/api/personajes/${id}/referencias`, json("PATCH", { ids }));

/**
 * Dice qué vista es cada foto que ya está en el personaje. `vistaClave: null` la deja sin clasificar. El
 * servidor decide si eso crea versión: si la vista es la que ya tenía, no se gasta un número.
 */
export const asignarVistasDeReferencias = (id: string, vistas: { id: string; vistaClave: Vista | null }[]) =>
  pedir<PersonajeVista>(`/api/personajes/${id}/referencias`, json("PATCH", { vistas }));

/**
 * Comprueba si una vista generada es la misma persona que la cara de referencia (0.24.0). Devuelve el personaje
 * recalculado, así que la cobertura que se ve después es la de verdad.
 *
 * `comprobada: false` **no es un error de red**: es que no se ha podido comprobar (falta la autorización del
 * consentimiento, falta un servicio que vea, o Jev no ha contestado) y `motivo` dice cuál de las tres.
 */
export const comprobarIdentidadDeReferencia = (id: string, referenciaId: string) =>
  pedir<{
    comprobada: boolean;
    motivo: string;
    veredicto: string | null;
    evidencia: string;
    confianza: number;
    decisionId: string;
    personaje: PersonajeVista;
  }>(`/api/personajes/${id}/identidad`, json("POST", { referenciaId }));

export interface DatosConsentimientoEnvio {
  titular: string;
  mayoriaDeEdad: boolean;
  /** Autorización para la comprobación de identidad (0.24.0). Opcional. */
  coherencia: boolean;
  alcance: string;
  documentoId?: string;
}

export const registrarConsentimiento = (id: string, datos: DatosConsentimientoEnvio) =>
  pedir<PersonajeVista>(`/api/personajes/${id}/consentimiento`, json("POST", datos));

export const revocarConsentimiento = (id: string, motivo: string) =>
  pedir<PersonajeVista>(`/api/personajes/${id}/consentimiento`, json("DELETE", { motivo }));

/** Revisión del documento de un tercero. Solo funciona para quien administra la instalación. */
export const revisarConsentimiento = (id: string, aceptado: boolean, nota: string) =>
  pedir<PersonajeVista>(`/api/personajes/${id}/revision`, json("POST", { aceptado, nota }));

// ── Personajes inventados (0.22.0) ─────────────────────────────────────────────────────────────────────────

/**
 * Crea un **personaje inventado**: no existe, su cara se genera y no admite fotos reales. `declaracion` es la
 * declaración de que no representa a ninguna persona real, y sin ella el servidor no lo crea.
 */
export const crearPersonajeInventado = (datos: {
  nombre: string;
  descripcion: string;
  declaracion: boolean;
  estiloAnimado: string;
  guiaPaleta?: string;
  guiaTrazo?: string;
  guiaDetalle?: string;
  guiaReferencias?: string[];
}) => pedir<PersonajeVista>("/api/personajes/inventados", json("POST", datos));

/**
 * Lo que se confirma para generar los retratos. Es la confirmación de dinero de siempre **sin la revisión de
 * referencias**: un personaje inventado no tiene fotos en las que pueda aparecer un tercero.
 */
export type ConfirmacionRetratos = Omit<ConfirmacionVistaSintetica, "vista" | "sinTerceros">;

/** Retratos candidatos ya generados de un personaje inventado, por identificador de medio. */
export const consultarRetratos = (id: string) => pedir<{ candidatos: Medio[] }>(`/api/personajes/${id}/retratos`);

/**
 * Genera los cuatro retratos candidatos a partir de la descripción. **Cuesta**: cada uno es un fotograma con su
 * estimación y su confirmación, así que viaja lo mismo que confirma cualquier otro envío.
 */
export const generarRetratos = (id: string, confirmacion: ConfirmacionRetratos) =>
  pedir<{ trabajos: TrabajoVista[]; aviso: string }>(
    `/api/personajes/${id}/retratos`,
    json("POST", { accion: "generar", ...confirmacion }),
  );

/** Descarta los retratos candidatos pendientes: dejan de ofrecerse, pero siguen en la biblioteca. Gratis. */
export const descartarRetratos = (id: string) =>
  pedir<{ descartados: number }>(`/api/personajes/${id}/retratos`, json("POST", { accion: "descartar" }));

/** Elige uno de los candidatos como cara del personaje. **No cuesta nada**: ya están pagados. */
export const elegirRetrato = (id: string, medioId: string) =>
  pedir<PersonajeVista>(`/api/personajes/${id}/retratos`, json("POST", { accion: "elegir", medioId }));

/**
 * Registra al personaje en el proveedor para las escenas habladas de un proyecto (0.22.0). **No cuesta
 * créditos**, pero envía su retrato, así que el servidor exige consentimiento vigente. `volverARegistrar`
 * reemplaza un identificador que el proveedor ya no reconoce.
 */
export const registrarEnOmni = (id: string, proyectoId: string, volverARegistrar = false) =>
  pedir<PersonajeVista>(`/api/personajes/${id}/omni`, json("POST", { proyectoId, volverARegistrar }));
