import type { Capacidad, ModeloVista } from "@/lib/catalogo";
import { precioDeModelo } from "../catalogo";
import {
  type Adaptador,
  ErrorProveedor,
  type PeticionAdaptador,
  type PeticionConsulta,
  type PeticionReferencia,
  type PrecioModelo,
  type TareaProveedor,
} from "../contrato";
import { consultarTarea, crearTarea, ErrorApimart, saldoCuenta, urlPublicaDeReferencia } from "./cliente";
import { CAMPOS_DE_URL, entradaDeModelo, tieneEntrada } from "./entradas";

/**
 * Adaptador de APIMart sobre el contrato de proveedores (ADR-0015 y ADR-0044). APIMart es un agregador que
 * factura **por segundo usado** y **no cobra las generaciones fallidas**: el status de cada tarea trae
 * `credits_cost` y `cost` en USD, y esa conciliación es la que revisa el apunte de gasto.
 *
 * Lo que lo distingue de KIE (ADR-0044) es la referencia: APIMart **no sube nada** y solo acepta una URL
 * pública `http/https`. Aquí se firma una URL GET de 50 min del almacenamiento de esta instalación
 * (`S3_ENDPOINT_PUBLIC`, variable opcional); sin esa variable la instalación no puede usar APIMart, y lo
 * dice sin llamar a nadie ni gastar nada.
 *
 * Solo vídeo e imagen: APIMart no expone voz ni omni como KIE, así que no se implementan `generarVoz`,
 * `registrarVoz` ni `registrarPersonaje`, y sus proyectos no pueden usar el modo `omni` ni un motor de voz.
 */

const CAPACIDADES: readonly Capacidad[] = ["image_to_video", "text_to_video", "image_edit", "text_to_image"];

/** Traduce el fallo del cliente a `ErrorProveedor` con su código propio; el resto se deja pasar. */
async function normalizando<T>(accion: () => Promise<T>): Promise<T> {
  try {
    return await accion();
  } catch (error) {
    if (error instanceof ErrorApimart) throw new ErrorProveedor("apimart", error.codigo, error.message);
    throw error;
  }
}

function entornoAlmacenamiento() {
  return {
    endpointPublico: process.env.S3_ENDPOINT_PUBLIC,
    region: process.env.S3_REGION ?? "us-east-1",
    bucket: process.env.S3_BUCKET ?? "escenara",
    claveAcceso: process.env.S3_ACCESS_KEY_ID ?? "",
    secreto: process.env.S3_SECRET_ACCESS_KEY ?? "",
  };
}

/** Sube la referencia: para APIMart, «subir» es firmar la URL pública que el proveedor va a bajar. */
async function subirReferencia(peticion: PeticionReferencia): Promise<string> {
  if (!peticion.claveAlmacenamiento) {
    throw new Error(
      "No se puede firmar la URL pública de la referencia: no llegó su clave de almacenamiento. Vuelve a intentarlo.",
    );
  }
  return urlPublicaDeReferencia(peticion.claveAlmacenamiento, entornoAlmacenamiento());
}

async function crear({ clave, entrada, buscar, callbackUrl }: PeticionAdaptador, tipo: "video" | "imagen") {
  return normalizando(() => crearTarea(clave, tipo, entrada, buscar, callbackUrl));
}

export const adaptadorApimart: Adaptador = {
  proveedor: "apimart",
  capacidades: CAPACIDADES,
  camposDeUrl: CAMPOS_DE_URL,

  admite(capacidad: Capacidad): boolean {
    return CAPACIDADES.includes(capacidad);
  },

  montarEntrada(modelo, contexto): Record<string, unknown> {
    return entradaDeModelo(modelo, contexto);
  },

  /**
   * Todas las referencias de los modelos de APIMart son **galería**: describen lo que tiene que salir, no
   * son un fotograma de principio o de fin. El hailuo recibe una sola como `first_frame_image`; el omni y el
   * veo reciben su lista completa.
   */
  referenciasDeGaleria(modelo: ModeloVista): number {
    return modelo.parametros.maximoReferencias;
  },

  subirReferencia,

  generarImagen(peticion: PeticionAdaptador): Promise<string> {
    return crear(peticion, "imagen");
  },

  generarVideo(peticion: PeticionAdaptador): Promise<string> {
    return crear(peticion, "video");
  },

  consultar({ clave, taskId, buscar }: PeticionConsulta): Promise<TareaProveedor> {
    return normalizando(async () => {
      const estado = await consultarTarea(clave, taskId, buscar);
      return {
        estado: estado.estado,
        estadoPropio: estado.estadoPropio,
        urls: estado.urls,
        creditos: estado.creditos,
        haFallado: estado.haFallado,
        causaFallo: estado.causaFallo ?? undefined,
      };
    });
  },

  /** APIMart no implementa voz ni omni como KIE: sus proyectos no pueden usar el modo omni ni un motor de voz. */
  registrarVoz: undefined,
  registrarPersonaje: undefined,

  sabeMontar(modelo: string): boolean {
    return tieneEntrada(modelo);
  },

  estimar(modelo: string, unidad?: string): Promise<PrecioModelo> {
    return precioDeModelo("apimart", modelo, unidad);
  },

  probarCredencial({ clave, buscar }): Promise<number | null> {
    return normalizando(() => saldoCuenta(clave, buscar));
  },
};
