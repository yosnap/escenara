import type { Capacidad, ModeloVista } from "@/lib/catalogo";
import { precioDeModelo } from "../catalogo";
import {
  type Adaptador,
  ErrorProveedor,
  type PeticionAdaptador,
  type PeticionConsulta,
  type PeticionReferencia,
  type PeticionTexto,
  type PrecioModelo,
  type TareaProveedor,
  type TextoProveedor,
} from "../contrato";
import { consultarTarea, crearTarea, ErrorKie, saldoCreditos, subirReferencia } from "./cliente";
import { CAMPOS_DE_URL, type ContextoEntrada, entradaDeModelo } from "./entradas";
import { generarTextoKie } from "./texto";

/**
 * Adaptador de KIE.ai sobre el contrato de proveedores (ADR-0015). No cambia nada de lo que hacía la
 * 0.10.0: usa los mismos endpoints (`jobs/createTask` y `jobs/recordInfo`), el mismo cliente y la misma
 * traducción de estados. Lo único que añade es la frontera: fuera de aquí ya no se habla de KIE, sino de
 * capacidades y de errores normalizados.
 *
 * Imagen y vídeo se piden igual en KIE (una tarea con `model` e `input`), así que `generarImagen` y
 * `generarVideo` comparten implementación. Lo que cambia por modelo es la entrada, y eso lo monta
 * `entradas.ts` a partir de los parámetros comprobados del catálogo.
 */

/**
 * `text_generation` se añade en la 0.17.0: KIE también ofrece modelos de chat, con su propio endpoint
 * síncrono (`codex/v1/responses`). El asistente de guion los usa con la **misma credencial de KIE** del
 * usuario, así que no hace falta una segunda clave.
 */
/**
 * `tts` se añade en la 0.21.0: el «market» de KIE revende modelos de voz de terceros (ElevenLabs) por el mismo
 * `jobs/createTask` asíncrono y con la **misma credencial de KIE** del usuario, así que no hace falta una segunda
 * clave (ADR-0026). Qué modelo concreto se puede usar lo decide el catálogo, no esta lista.
 */
const CAPACIDADES: readonly Capacidad[] = [
  "image_edit",
  "image_to_video",
  "text_to_video",
  "text_generation",
  "tts",
];

/** Todo fallo del cliente sale de aquí como `ErrorProveedor`, con su código propio y su mensaje. */
async function normalizando<T>(accion: () => Promise<T>): Promise<T> {
  try {
    return await accion();
  } catch (error) {
    if (error instanceof ErrorKie) throw new ErrorProveedor("kie", error.codigo, error.message);
    throw error;
  }
}

async function crear({ clave, modelo, entrada, buscar, callbackUrl }: PeticionAdaptador): Promise<string> {
  return normalizando(() => crearTarea(clave, modelo, entrada, buscar, callbackUrl));
}

export const adaptadorKie: Adaptador = {
  proveedor: "kie",
  capacidades: CAPACIDADES,
  camposDeUrl: CAMPOS_DE_URL,

  admite(capacidad: Capacidad): boolean {
    return CAPACIDADES.includes(capacidad);
  },

  montarEntrada(modelo: ModeloVista, contexto: ContextoEntrada): Record<string, unknown> {
    return entradaDeModelo(modelo, contexto);
  },

  subirReferencia({ clave, archivo, buscar }: PeticionReferencia): Promise<string> {
    return normalizando(() => subirReferencia(clave, archivo, buscar));
  },

  generarImagen: crear,
  generarVideo: crear,
  // La voz se pide igual que el vídeo: una tarea con `model` e `input`. Lo que cambia es la entrada, y eso lo
  // monta `entradas.ts` con los campos documentados de ese modelo.
  generarVoz: crear,

  consultar({ clave, taskId, buscar }: PeticionConsulta): Promise<TareaProveedor> {
    return normalizando(() => consultarTarea(clave, taskId, buscar));
  },

  generarTexto({ clave, modelo, instrucciones, entrada, buscar }: PeticionTexto): Promise<TextoProveedor> {
    return normalizando(() => generarTextoKie(clave, modelo, instrucciones, entrada, buscar));
  },

  estimar(modelo: string): Promise<PrecioModelo> {
    return precioDeModelo("kie", modelo);
  },

  probarCredencial({ clave, buscar }): Promise<number | null> {
    return normalizando(() => saldoCreditos(clave, buscar));
  },
};
