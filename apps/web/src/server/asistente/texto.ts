import type { EstimacionTexto } from "@/lib/proyectos";
import { eurosPorCreditoDe, leerAjustes } from "../ajustes";
import type { EleccionDeTrabajo } from "../generacion/precios";
import { estimarTextoConReserva, type TechoPorLlamada } from "../mapa/texto";
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
 * `porCuota`, y la pantalla lo dice así en lugar de «0 créditos». Aparte va la **reserva de pago**: la entrada de
 * pago más cara del mapa detrás de la principal, que puede escribir si la principal falla (un servicio de cuota
 * saturado, por ejemplo). Su precio entra en el total confirmado como la llamada de reserva, y su sello en el sello.
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
  return (await estadoConPrecios(usuarioId)).estado;
}

/**
 * Igual, pero para el camino que va a gastar: un asistente no disponible es un error con su motivo. Devuelve la
 * estimación que hay que confirmar y en qué moneda está cada precio.
 */
export async function exigirAsistenteDisponible(usuarioId: string): Promise<AsistenteParaGastar> {
  const { estado, techo, reserva } = await estadoConPrecios(usuarioId);
  if (!estado.disponible || !estado.estimacion || !techo) throw new ErrorProyecto(409, estado.motivo);
  return { estimacion: estado.estimacion, techo, reserva };
}

/** Lo que necesita el camino que gasta: la estimación confirmada y en qué moneda está cada precio. */
export interface AsistenteParaGastar {
  estimacion: EstimacionTexto;
  /** Precio por llamada de la principal, en los créditos de su proveedor (0 si va por cuota). */
  techo: TechoPorLlamada;
  /** Precio por llamada de la reserva de pago, en los créditos de su proveedor; `null` si no hay. */
  reserva: TechoPorLlamada | null;
}

interface EstadoConPrecios {
  estado: EstadoAsistente;
  techo: TechoPorLlamada | null;
  reserva: TechoPorLlamada | null;
}

const noDisponible = (motivo: string): EstadoConPrecios => ({
  estado: { disponible: false, motivo, estimacion: null },
  techo: null,
  reserva: null,
});

async function estadoConPrecios(usuarioId: string): Promise<EstadoConPrecios> {
  const ajustes = await leerAjustes();
  if (!ajustes.asistenteActivo) return noDisponible(APAGADO);
  const { estimacion: mapa, reserva } = await estimarTextoConReserva(usuarioId);
  if (!mapa.hayEntradas) return noDisponible(`${mapa.motivo} Mientras, puedes escribir el guion a mano.`);
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
        sello: selloDelAsistente(mapa.porCuota, mapa.sello, reserva?.sello ?? ""),
        porCuota: mapa.porCuota,
        nombreProveedor: mapa.nombreProveedor,
        reserva: reserva
          ? {
              creditos: reserva.creditos,
              euros: reserva.creditos * eurosPorCreditoDe(ajustes, reserva.proveedor),
              comprobado: reserva.comprobado,
            }
          : null,
      },
    },
    techo: { creditos: mapa.creditos, proveedor: mapa.proveedor },
    reserva: reserva ? { creditos: reserva.creditos, proveedor: reserva.proveedor } : null,
  };
}

/**
 * Sello de lo que se confirma: **el modo** (`cuota|` o `pago|`) y después el sello del precio de la principal y los de
 * las entradas que pueden hacer de reserva de pago, unidos con «+». Se sella todo lo que entra en el total: un cambio
 * de precio de la principal o de cualquier posible reserva cambia el sello, y la confirmación se rechaza con un 409.
 * El modo va delante porque «NaN por cuota con KIE de reserva» y «KIE de principal» sellarían el mismo precio de KIE
 * y, sin él, darían el mismo sello aunque se confirme otra cosa. Nunca está vacío, así que siempre se exige.
 */
export function selloDelAsistente(porCuota: boolean, selloPrincipal: string, selloReserva: string): string {
  return `${porCuota ? "cuota" : "pago"}|${[selloPrincipal, selloReserva].filter((s) => s !== "").join("+")}`;
}
