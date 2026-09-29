import type { Capacidad, ModeloVista } from "@/lib/catalogo";
import { precioDeModelo } from "../catalogo";
import {
  type Adaptador,
  ErrorProveedor,
  type PersonajeRegistrado,
  type PeticionAdaptador,
  type PeticionConsulta,
  type PeticionPersonajeRegistrado,
  type PeticionReferencia,
  type PeticionTexto,
  type PeticionVozRegistrada,
  type PrecioModelo,
  type TareaProveedor,
  type TextoProveedor,
  type VozPedida,
} from "../contrato";
import {
  consultarTarea,
  crearTarea,
  ErrorKie,
  registrarPersonajeOmni,
  registrarVozOmni,
  saldoCreditos,
  subirReferencia,
} from "./cliente";
import { CAMPOS_DE_URL, type ContextoEntrada, entradaDeModelo, referenciasDeGaleria, tieneEntrada } from "./entradas";
import { gemeloDeTextoAImagen } from "./familias";
import { modelosPublicadosDeKie } from "./publicados";
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
  // `text_to_image` se añade en la 0.23.4: hay generaciones que no parten de ninguna foto y pedírselas a un
  // modelo de edición sería pedirle que editara una imagen que no existe.
  "text_to_image",
  "image_to_video",
  "text_to_video",
  // `audio_to_video` se añade en la 0.29.0: los modelos de lip-sync que animan un retrato con un audio subido.
  // Se piden por el mismo `jobs/createTask` que el resto del vídeo; lo único propio son sus campos.
  "audio_to_video",
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

  referenciasDeGaleria(modelo: ModeloVista): number {
    return referenciasDeGaleria(modelo);
  },

  subirReferencia({ clave, archivo, buscar }: PeticionReferencia): Promise<string> {
    return normalizando(() => subirReferencia(clave, archivo, buscar));
  },

  generarImagen: crear,
  generarVideo: crear,
  /**
   * La voz se pide igual que el vídeo: `jobs/createTask` con `{ model, input }`, con los campos del modelo
   * **envueltos bajo `input`** (`cliente.ts › crearTarea`), que es lo que espera el «market». Lo que cambia por
   * modelo es la entrada, y eso lo monta `entradas.ts`.
   *
   * KIE es **asíncrono**, así que nunca devuelve el audio aquí: solo el identificador de la tarea.
   */
  async generarVoz(peticion: PeticionAdaptador): Promise<VozPedida> {
    return { taskId: await crear(peticion) };
  },

  /**
   * Registro de la voz del proyecto en Omni (0.22.0). Síncrono y sin coste: devuelve el `audioId` que después se
   * cita al registrar al personaje.
   */
  registrarVoz({ clave, voz, nombre, descripcion, ejemplo, buscar }: PeticionVozRegistrada): Promise<string> {
    return normalizando(() => registrarVozOmni(clave, { voz, nombre, descripcion, ejemplo }, buscar));
  },

  /**
   * Registro del personaje en Omni (0.22.0). Envía su retrato ya subido al almacenamiento temporal de KIE y la
   * voz registrada, y devuelve el identificador que viaja en `character_ids` al generar cada escena.
   */
  async registrarPersonaje({
    clave,
    nombre,
    descripcion,
    imagenes,
    vocesRegistradas,
    buscar,
  }: PeticionPersonajeRegistrado): Promise<PersonajeRegistrado> {
    const personaje = await normalizando(() =>
      registrarPersonajeOmni(clave, { nombre, descripcion, imagenes, audioIds: vocesRegistradas }, buscar),
    );
    return {
      id: personaje.characterId,
      imagenUrl: personaje.imageUrl,
      imagenCuerpoUrl: personaje.bodyImageUrl,
    };
  },

  consultar({ clave, taskId, buscar }: PeticionConsulta): Promise<TareaProveedor> {
    return normalizando(() => consultarTarea(clave, taskId, buscar));
  },

  generarTexto({ clave, modelo, instrucciones, entrada, buscar }: PeticionTexto): Promise<TextoProveedor> {
    return normalizando(() => generarTextoKie(clave, modelo, instrucciones, entrada, buscar));
  },

  sabeMontar(modelo: string): boolean {
    return tieneEntrada(modelo);
  },

  /**
   * Catálogo publicado por KIE con sus tarifas (0.23.0). Es una API pública y gratuita, así que no recibe
   * ninguna credencial ni consume créditos.
   */
  modelosPublicados(buscar) {
    return modelosPublicadosDeKie(buscar);
  },

  gemeloSinReferencia(modelo: string): string | null {
    return gemeloDeTextoAImagen(modelo);
  },

  estimar(modelo: string, unidad?: string): Promise<PrecioModelo> {
    return precioDeModelo("kie", modelo, unidad);
  },

  probarCredencial({ clave, buscar }): Promise<number | null> {
    return normalizando(() => saldoCreditos(clave, buscar));
  },
};
