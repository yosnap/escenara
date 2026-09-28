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
import { ErrorCompatible, listarModelos, pedirVoz } from "./cliente";

/**
 * Adaptador de los servicios **compatibles con la API de OpenAI** sobre el contrato de proveedores (ADR-0015),
 * para la capacidad de voz (0.21.1).
 *
 * Tiene una diferencia con todos los demás y conviene tenerla delante: **no es un proveedor, es un género**. El
 * servicio concreto (su nombre y su dirección) lo elige cada usuario en «Tu cuenta», así que la URL base llega
 * en la entrada del trabajo, montada al encolar, y no está escrita aquí.
 *
 * Es **síncrono**, como ElevenLabs: devuelve el audio en la misma llamada, así que no hay tarea que consultar.
 * Y se paga **por cuota del plan, no por petición**: su precio registrado es 0 créditos, lo que significa que el
 * trabajo no aparta nada y su apunte de gasto es de 0. Los créditos de este proveedor no se comparan con los de
 * ningún otro, porque no son la misma unidad ni miden lo mismo.
 */

const CAPACIDADES: readonly Capacidad[] = ["tts"];

async function normalizando<T>(accion: () => Promise<T>): Promise<T> {
  try {
    return await accion();
  } catch (error) {
    if (error instanceof ErrorCompatible) {
      throw new ErrorProveedor("compatible", error.codigo, error.detalle === "" ? undefined : error.detalle);
    }
    throw error;
  }
}

const noAplica = (que: string): never => {
  throw new ErrorProveedor(
    "compatible",
    "formato",
    `Un servicio compatible con la API de OpenAI solo genera voz y texto en Escenara: no ${que}.`,
  );
};

export const adaptadorCompatible: Adaptador = {
  proveedor: "compatible",
  capacidades: CAPACIDADES,
  camposDeUrl: [],

  admite(capacidad: Capacidad): boolean {
    return CAPACIDADES.includes(capacidad);
  },

  /**
   * La entrada es el texto, la voz y **la dirección del servicio**: sin ella no se sabría a quién llamar, porque
   * el servicio lo elige cada usuario. Queda guardada en el trabajo, así que lo que se envía es lo que se
   * confirmó, aunque el usuario cambie su mapa mientras tanto.
   */
  montarEntrada(_modelo: ModeloVista, contexto: ContextoEntrada): Record<string, unknown> {
    if (!contexto.voz) {
      throw new ErrorProveedor(
        "compatible",
        "formato",
        "No hay ninguna voz fijada para este proyecto. Elige la voz antes de generar su pista de audio.",
      );
    }
    return {
      texto: contexto.dialogo,
      voz: contexto.voz.voz,
      parametros: contexto.voz.parametros,
      urlBase: contexto.urlBaseCompatible ?? "",
    };
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
   * Genera la voz y devuelve el audio ya hecho. `creditosInformados` es **0 y no es una estimación**: este
   * servicio no cobra por petición, así que lo que se apunta es cero de verdad.
   */
  async generarVoz({ clave, modelo, entrada, buscar }: PeticionAdaptador): Promise<VozPedida> {
    const { texto, voz, parametros, urlBase } = entrada as {
      texto?: unknown;
      voz?: unknown;
      parametros?: Record<string, number>;
      urlBase?: unknown;
    };
    if (typeof texto !== "string" || typeof voz !== "string" || typeof urlBase !== "string" || urlBase === "") {
      throw new ErrorProveedor("compatible", "formato", "Falta el texto, la voz o la dirección del servicio.");
    }
    const generada = await normalizando(() =>
      pedirVoz({
        urlBase,
        clave,
        modelo,
        voz,
        texto,
        // La velocidad es el único parámetro que la API de OpenAI define; los de timbre de ElevenLabs no
        // existen aquí y **no se inventan**: mandarlos como si existieran daría una falsa sensación de control.
        ...(parametros?.velocidad === undefined ? {} : { velocidad: parametros.velocidad }),
        buscar,
      }),
    );
    return {
      taskId: `compatible-${Date.now()}`,
      inmediata: {
        audio: generada.audio,
        mime: generada.mime,
        nombre: "voz.mp3",
        creditosInformados: 0,
        // Sin marcas por carácter: la API de OpenAI no las da, así que los subtítulos salen del diálogo o de
        // transcribir el audio. Inventarlas colocaría palabras donde nadie las ha dicho.
        marcas: null,
      },
    };
  },

  /**
   * No hay tareas que consultar: el audio llega en la misma llamada. Que esto se alcance significa que el
   * proceso se cayó entre generar y guardar, así que lo honesto es decir que no se sabe y dejar que lo mire una
   * persona, en lugar de volver a llamar.
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
    return precioDeModelo("compatible", modelo);
  },

  /**
   * La prueba de credencial de estos servicios vive en la bóveda (`boveda/compatibles.ts`), porque necesita la
   * dirección del servicio y aquí no la hay. Esto existe solo para cumplir el contrato.
   */
  probarCredencial(): Promise<number | null> {
    void listarModelos;
    return Promise.resolve(noAplica("prueba su clave desde aquí"));
  },
};
