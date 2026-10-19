import type { EstimacionTexto } from "@/lib/proyectos";
import { eurosPorCreditoDe, leerAjustes } from "../ajustes";
import type { EleccionDeTrabajo } from "../generacion/precios";
import { estimarTextoPorMapa } from "../mapa/texto";
import { ErrorCatalogo } from "../proveedores/contrato";
import { resolver } from "../proveedores/registro";
import { ErrorProyecto } from "./errores";

/**
 * Si el asistente de guion se puede usar ahora mismo y lo que costaría cada llamada.
 *
 * El asistente es **opcional por diseño**: escribir el guion a mano es un camino de primera clase, así que
 * aquí nada lanza una excepción por sorpresa. `estadoDelAsistente` devuelve siempre un motivo legible, y solo
 * `exigirAsistenteDisponible` —el camino que va a gastar— convierte ese motivo en un error.
 *
 * El guion se escribe **recorriendo el mapa de modelos de texto del usuario**, así que la estimación y la
 * disponibilidad salen de ese mismo mapa (`estimarTextoPorMapa`): lo que se enseña y se confirma es lo que costaría
 * su entrada principal, que es lo que se va a usar, y no el modelo de texto de la instalación. Tiene que cumplirse:
 *
 * 1. quien administra lo ha encendido en Admin › Ajustes (viene apagado de fábrica: cuesta dinero);
 * 2. el mapa del usuario tiene al menos una entrada utilizable (con su clave válida) y, si la principal es de pago,
 *    con precio registrado: sin precio no se estima y sin estimación no se gasta.
 *
 * Una entrada principal que se paga por **cuota del plan** (un servicio compatible) se estima en 0 créditos con
 * `porCuota`, y la pantalla lo dice así en lugar de «0 créditos».
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

/**
 * Modelo de texto **de la instalación**: modelo del catálogo, adaptador y precio vigente. Ya no decide el guion
 * (que sale del mapa del usuario); lo usa la traducción de prompts, cuyo coste se suma al de cada envío.
 */
export async function eleccionDeTexto(): Promise<EleccionDeTrabajo> {
  const { modelo, adaptador } = await resolver("text_generation");
  if (!adaptador.generarTexto) {
    throw new ErrorCatalogo(503, `El adaptador de ${modelo.nombreProveedor} todavía no sabe pedir texto.`);
  }
  return { modelo, adaptador, precio: await adaptador.estimar(modelo.modelo) };
}

/** Estado del asistente para este usuario, con el motivo legible si no está disponible. */
export async function estadoDelAsistente(usuarioId: string): Promise<EstadoAsistente> {
  return (await estadoConProveedor(usuarioId)).estado;
}

/**
 * Igual, pero para el camino que va a gastar: un asistente no disponible es un error con su motivo. Devuelve la
 * estimación que hay que confirmar y el proveedor que cobraría, que es en cuya moneda están sus créditos.
 */
export async function exigirAsistenteDisponible(
  usuarioId: string,
): Promise<{ estimacion: EstimacionTexto; proveedor: string }> {
  const { estado, proveedor } = await estadoConProveedor(usuarioId);
  if (!estado.disponible || !estado.estimacion) throw new ErrorProyecto(409, estado.motivo);
  return { estimacion: estado.estimacion, proveedor };
}

async function estadoConProveedor(usuarioId: string): Promise<{ estado: EstadoAsistente; proveedor: string }> {
  const ajustes = await leerAjustes();
  if (!ajustes.asistenteActivo)
    return { estado: { disponible: false, motivo: APAGADO, estimacion: null }, proveedor: "" };
  const mapa = await estimarTextoPorMapa(usuarioId);
  if (!mapa.hayEntradas) {
    return {
      estado: {
        disponible: false,
        motivo: `${mapa.motivo} Mientras, puedes escribir el guion a mano.`,
        estimacion: null,
      },
      proveedor: "",
    };
  }
  return {
    estado: {
      disponible: true,
      motivo: "",
      estimacion: {
        modelo: mapa.modelo,
        // Un servicio compatible no tiene nombre de catálogo; el modelo solo lo ve quien administra.
        nombreModelo: mapa.modelo,
        creditos: mapa.creditos,
        euros: mapa.porCuota ? 0 : mapa.creditos * eurosPorCreditoDe(ajustes, mapa.proveedor),
        comprobado: mapa.comprobado,
        sello: mapa.sello,
        porCuota: mapa.porCuota,
        nombreProveedor: mapa.nombreProveedor,
      },
    },
    proveedor: mapa.proveedor,
  };
}
