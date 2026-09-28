import type { Capacidad, ModeloVista } from "@/lib/catalogo";
import { precioDeModelo } from "../catalogo";
import {
  type Adaptador,
  type ContextoEntrada,
  ErrorProveedor,
  type PeticionAdaptador,
  type PeticionConsulta,
  type PeticionReferencia,
  type PrecioModelo,
  type TareaProveedor,
  type VozPedida,
} from "../contrato";
import { contarVoces, ErrorElevenLabs, generarVozEleven } from "./cliente";

/**
 * Adaptador de ElevenLabs sobre el contrato de proveedores (ADR-0015), como **proveedor de voz de reserva**
 * (0.21.0, ADR-0025).
 *
 * Solo hace una cosa —voz—, y esa es toda su diferencia con KIE: no genera imágenes, no genera vídeo, no sube
 * referencias y no tiene tareas que consultar, porque **contesta con el audio en la misma llamada**. El contrato
 * lo admite: `generarVoz` devuelve el resultado en `inmediata` y quien despacha lo guarda sin esperar a nada.
 *
 * Los métodos que no puede cumplir lanzan con su motivo en lugar de devolver algo inventado. No se alcanzan: el
 * catálogo solo le da modelos de `tts`, y `resolver` comprueba la capacidad antes de elegirlo.
 */

const CAPACIDADES: readonly Capacidad[] = ["tts"];

/** Todo fallo del cliente sale de aquí como `ErrorProveedor`, con su código propio y su mensaje. */
async function normalizando<T>(accion: () => Promise<T>): Promise<T> {
  try {
    return await accion();
  } catch (error) {
    if (error instanceof ErrorElevenLabs) throw new ErrorProveedor("elevenlabs", error.codigo, error.message);
    throw error;
  }
}

const noAplica = (que: string): never => {
  throw new ErrorProveedor("elevenlabs", "formato", `ElevenLabs solo genera voz en Escenara: no ${que}.`);
};

export const adaptadorElevenLabs: Adaptador = {
  proveedor: "elevenlabs",
  capacidades: CAPACIDADES,
  // No recibe ninguna referencia, así que no hay ningún campo suyo que lleve una URL de archivo.
  camposDeUrl: [],

  admite(capacidad: Capacidad): boolean {
    return CAPACIDADES.includes(capacidad);
  },

  /**
   * La entrada de ElevenLabs es **la voz y el texto**, y nada más: ni prompt visual, ni referencias, ni
   * duración. El cuerpo con los nombres de campo del proveedor lo monta `cliente.ts`, porque aquí no se sabe
   * todavía con qué modelo se va a llamar.
   */
  montarEntrada(_modelo: ModeloVista, contexto: ContextoEntrada): Record<string, unknown> {
    if (!contexto.voz) {
      throw new ErrorProveedor(
        "elevenlabs",
        "formato",
        "No hay ninguna voz fijada para este proyecto. Elige la voz antes de generar su pista de audio.",
      );
    }
    return { texto: contexto.dialogo, voz: contexto.voz.voz, parametros: contexto.voz.parametros };
  },

  subirReferencia(_peticion: PeticionReferencia): Promise<string> {
    return Promise.resolve(noAplica("acepta imágenes de referencia"));
  },

  generarImagen(_peticion: PeticionAdaptador): Promise<string> {
    return Promise.resolve(noAplica("genera imágenes"));
  },

  generarVideo(_peticion: PeticionAdaptador): Promise<string> {
    return Promise.resolve(noAplica("genera vídeo"));
  },

  /**
   * Genera la voz y devuelve **el audio ya hecho**: la llamada es síncrona y tarda unos segundos. El coste real
   * viene en la cabecera `character-cost` del propio proveedor, así que lo que se apunta en el registro de gasto
   * no es la estimación, sino lo que ha costado.
   */
  async generarVoz({ clave, modelo, entrada, buscar }: PeticionAdaptador): Promise<VozPedida> {
    const { texto, voz, parametros } = entrada as {
      texto?: unknown;
      voz?: unknown;
      parametros?: Record<string, number>;
    };
    if (typeof texto !== "string" || typeof voz !== "string" || !parametros) {
      throw new ErrorProveedor("elevenlabs", "formato", "Falta el texto o la voz de esta pista.");
    }
    const generada = await normalizando(() =>
      generarVozEleven(
        clave,
        modelo,
        voz,
        texto,
        {
          estabilidad: parametros.estabilidad ?? 0.5,
          similitud: parametros.similitud ?? 0.75,
          estilo: parametros.estilo ?? 0,
          velocidad: parametros.velocidad ?? 1,
        },
        buscar,
      ),
    );
    return {
      taskId: generada.peticionId,
      inmediata: {
        audio: generada.audio,
        mime: generada.mime,
        nombre: "voz.mp3",
        creditosInformados: generada.coste,
        marcas: generada.alineacion
          ? {
              caracteres: generada.alineacion.caracteres,
              inicios: generada.alineacion.inicios,
              finales: generada.alineacion.finales,
            }
          : null,
      },
    };
  },

  /**
   * ElevenLabs **no tiene tareas que consultar**: el resultado llega en la misma llamada y se guarda ahí mismo.
   *
   * Que esto se alcance significa que el proceso se cayó entre pagar la llamada y guardar su audio, así que lo
   * honesto es decir que no se sabe: el trabajo queda en revisión con su reserva retenida y lo resuelve una
   * persona con el identificador de la petición. **Lo que no se hace es volver a llamar**, que sería pagar dos
   * veces por lo mismo.
   */
  consultar(_peticion: PeticionConsulta): Promise<TareaProveedor> {
    return Promise.resolve({
      estado: "sin-consulta",
      estadoPropio: "desconocido",
      urls: [],
      creditos: null,
      haFallado: false,
    });
  },

  estimar(modelo: string): Promise<PrecioModelo> {
    return precioDeModelo("elevenlabs", modelo);
  },

  /**
   * Prueba de la clave: la lista de voces. No genera nada y no cuesta nada. El detalle público es cuántas voces
   * ve esa clave, que además dice si está restringida.
   */
  async probarCredencial({ clave, buscar }): Promise<number | null> {
    return normalizando(() => contarVoces(clave, buscar));
  },
};
