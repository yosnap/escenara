import { esProveedor, PROVEEDORES_PUBLICOS } from "@/lib/boveda";
import type { EstimacionTexto } from "@/lib/proyectos";
import { eurosPorCreditoDe, leerAjustes } from "../ajustes";
import { listarCredenciales } from "../boveda/credenciales";
import type { EleccionDeTrabajo } from "../generacion/precios";
import { ErrorCatalogo } from "../proveedores/contrato";
import { resolver } from "../proveedores/registro";
import { ErrorProyecto } from "./errores";

/**
 * Qué modelo de texto usa el asistente y si se puede usar ahora mismo.
 *
 * El asistente es **opcional por diseño**: escribir el guion a mano es un camino de primera clase, así que
 * aquí nada lanza una excepción por sorpresa. `estadoDelAsistente` devuelve siempre un motivo legible, y solo
 * `eleccionDeTexto` —el camino que va a gastar— convierte ese motivo en un error.
 *
 * Tiene que cumplirse todo esto para que esté disponible:
 *
 * 1. quien administra lo ha encendido en Admin › Ajustes (viene apagado de fábrica: cuesta dinero);
 * 2. el catálogo tiene un modelo `text_generation` seleccionable **y con precio registrado** (sin precio no se
 *    estima y sin estimación no se gasta);
 * 3. el adaptador de ese proveedor sabe pedir texto;
 * 4. el usuario tiene su propia clave de ese proveedor, y válida (BYOK: paga él).
 */

export interface EstadoAsistente {
  disponible: boolean;
  /** Por qué no está disponible, con la acción concreta. Vacío cuando sí lo está. */
  motivo: string;
  /** Lo que costaría la llamada, con su sello; `null` si no está disponible. */
  estimacion: EstimacionTexto | null;
}

const APAGADO =
  "El asistente de guion está apagado en esta instalación. Escribe el guion a mano, o pídele a quien administra que lo encienda en Admin › Ajustes.";

/** Elección del modelo de texto: modelo del catálogo, adaptador y precio vigente. */
export async function eleccionDeTexto(): Promise<EleccionDeTrabajo> {
  const { modelo, adaptador } = await resolver("text_generation");
  if (!adaptador.generarTexto) {
    throw new ErrorCatalogo(503, `El adaptador de ${modelo.nombreProveedor} todavía no sabe pedir texto.`);
  }
  return { modelo, adaptador, precio: await adaptador.estimar(modelo.modelo) };
}

/** Estado del asistente para este usuario, con el motivo legible si no está disponible. */
export async function estadoDelAsistente(usuarioId: string): Promise<EstadoAsistente> {
  const ajustes = await leerAjustes();
  if (!ajustes.asistenteActivo) return { disponible: false, motivo: APAGADO, estimacion: null };
  let eleccion: EleccionDeTrabajo;
  try {
    eleccion = await eleccionDeTexto();
  } catch (error) {
    if (error instanceof ErrorCatalogo) return { disponible: false, motivo: error.message, estimacion: null };
    throw error;
  }
  // Un proveedor sin credenciales (el hueco de Google, ADR-0009) no puede cobrar nada: no está disponible.
  if (!esProveedor(eleccion.modelo.proveedor)) {
    return {
      disponible: false,
      motivo: `Esta instalación aún no puede pagar texto en ${eleccion.modelo.nombreProveedor}.`,
      estimacion: null,
    };
  }
  const proveedor = eleccion.modelo.proveedor;
  const credenciales = await listarCredenciales(usuarioId);
  const credencial = credenciales.find((c) => c.proveedor === proveedor) ?? null;
  const nombre = PROVEEDORES_PUBLICOS[proveedor].nombre;
  if (!credencial) {
    return {
      disponible: false,
      motivo: `El asistente escribe con tu propia clave de ${nombre}: añádela en «Tu cuenta». Mientras, puedes escribir el guion a mano.`,
      estimacion: null,
    };
  }
  if (credencial.estado !== "valida") {
    return {
      disponible: false,
      motivo: `Tu clave de ${nombre} está marcada como no válida. Pruébala o sustitúyela en «Tu cuenta».`,
      estimacion: null,
    };
  }
  const creditos = Math.ceil(eleccion.precio.creditos);
  return {
    disponible: true,
    motivo: "",
    estimacion: {
      modelo: eleccion.modelo.modelo,
      nombreModelo: eleccion.modelo.nombre,
      creditos,
      euros: creditos * eurosPorCreditoDe(ajustes, proveedor),
      comprobado: eleccion.precio.comprobado,
      sello: eleccion.precio.sello,
    },
  };
}

/** Igual, pero para el camino que va a gastar: un asistente no disponible es un error con su motivo. */
export async function exigirAsistenteDisponible(usuarioId: string): Promise<EleccionDeTrabajo> {
  const estado = await estadoDelAsistente(usuarioId);
  if (!estado.disponible) throw new ErrorProyecto(409, estado.motivo);
  return eleccionDeTexto();
}
