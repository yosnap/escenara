/**
 * Respuestas grabadas de la **tabla de precios pública** de KIE (0.23.0), transcritas de la descarga real del
 * 2026-09-28 (`POST https://api.kie.ai/client/v1/model-pricing/page`, 503 registros). Sirven para probar la
 * traducción y la sincronización **sin llamar a la red**: ningún test sale a internet.
 *
 * Es un recorte a propósito, elegido para que aparezca cada caso que hay que distinguir:
 *
 * - un modelo con varias resoluciones (`gpt image 2`) y otro con varias calidades (`ideogram character`);
 * - un precio de «texto a imagen», que desde la 0.23.4 se importa como su propio modelo (es el que genera sin
 *   imagen de partida);
 * - las cuatro duraciones publicadas de Gemini Omni 1.1 Flash, con su recargo por vídeo de entrada, que no es
 *   el precio de generar;
 * - un recargo por imagen de entrada (`seedream 5 Pro, input image`, `MiniMax H3, image input`), que **no** es
 *   el precio de generar;
 * - una tarifa por segundo (`MiniMax H3, reference to video`), que sí se puede estimar porque la duración se
 *   elige antes;
 * - un modelo sin familia en esta instalación (`wan 2.7 video`) y uno de chat, que queda fuera.
 */

export interface RegistroDePrecio {
  modelDescription: string;
  interfaceType: string;
  provider: string;
  creditPrice: string;
  creditUnit: string;
  usdPrice: string;
  anchor: string;
}

export const REGISTROS_DE_PRECIO: RegistroDePrecio[] = [
  {
    modelDescription: "gpt-6-luna, chat, Input",
    interfaceType: "chat",
    provider: "OpenAI",
    creditPrice: "6",
    creditUnit: "per million tokens",
    usdPrice: "0.03",
    anchor: "https://kie.ai/gpt-6-sol-and-luna?model=gpt-6-luna",
  },
  {
    modelDescription: "MiniMax H3, reference to video, 768p",
    interfaceType: "video",
    provider: "Hailuo",
    creditPrice: "8",
    creditUnit: "per second",
    usdPrice: "0.04",
    anchor: "https://kie.ai/minimax-h3?model=minimax-h3%2Freference-to-video",
  },
  {
    modelDescription: "MiniMax H3, image input, 768p, 2k",
    interfaceType: "video",
    provider: "Hailuo",
    creditPrice: "4",
    creditUnit: "per image",
    usdPrice: "0.02",
    anchor: "https://kie.ai/minimax-h3",
  },
  {
    modelDescription: "seedream 5 Pro, input image, First image free",
    interfaceType: "image",
    provider: "ByteDance",
    creditPrice: "0.5",
    creditUnit: "per image",
    usdPrice: "0.0025",
    anchor: "",
  },
  {
    modelDescription: "nano-banana-2-lite, 1k",
    interfaceType: "image",
    provider: "Google",
    creditPrice: "4",
    creditUnit: "per image",
    usdPrice: "0.02",
    anchor: "https://kie.ai/nano-banana-2-lite",
  },
  {
    modelDescription: "gpt image 2, image-to-image, 4k",
    interfaceType: "image",
    provider: "OpenAI",
    creditPrice: "16",
    creditUnit: "per image",
    usdPrice: "0.08",
    anchor: "https://kie.ai/gpt-image-2?model=gpt-image-2-image-to-image",
  },
  {
    modelDescription: "gpt image 2, image-to-image, 2k",
    interfaceType: "image",
    provider: "OpenAI",
    creditPrice: "10",
    creditUnit: "per image",
    usdPrice: "0.05",
    anchor: "https://kie.ai/gpt-image-2?model=gpt-image-2-image-to-image",
  },
  {
    modelDescription: "gpt image 2, image-to-image, 1k",
    interfaceType: "image",
    provider: "OpenAI",
    creditPrice: "6",
    creditUnit: "per image",
    usdPrice: "0.03",
    anchor: "https://kie.ai/gpt-image-2?model=gpt-image-2-image-to-image",
  },
  {
    modelDescription: "gpt image 2, text-to-image, 1k",
    interfaceType: "image",
    provider: "OpenAI",
    creditPrice: "6",
    creditUnit: "per image",
    usdPrice: "0.03",
    anchor: "https://kie.ai/gpt-image-2?model=gpt-image-2-text-to-image",
  },
  /**
   * Gemini Omni 1.1 Flash, tal cual lo publica KIE el 2026-09-28: **una tarifa por duración** a cada
   * resolución, más el recargo de «with video input», que no es el precio de generar. Los 63 créditos de 4 s
   * son exactamente los que cobró de verdad, así que las otras tres duraciones se pueden ofrecer con su precio
   * publicado sin inventar ninguna proporción.
   */
  {
    modelDescription: "google/gemini-omni-flash-1-1, video, 4s 720p no video input",
    interfaceType: "video",
    provider: "Google",
    creditPrice: "63",
    creditUnit: "per video",
    usdPrice: "0.315",
    anchor: "https://kie.ai/gemini-omni-1-1-flash",
  },
  {
    modelDescription: "google/gemini-omni-flash-1-1, video, 6s 720p no video input",
    interfaceType: "video",
    provider: "Google",
    creditPrice: "84",
    creditUnit: "per video",
    usdPrice: "0.42",
    anchor: "https://kie.ai/gemini-omni-1-1-flash",
  },
  {
    modelDescription: "google/gemini-omni-flash-1-1, video, 8s 720p no video input",
    interfaceType: "video",
    provider: "Google",
    creditPrice: "105",
    creditUnit: "per video",
    usdPrice: "0.525",
    anchor: "https://kie.ai/gemini-omni-1-1-flash",
  },
  {
    modelDescription: "google/gemini-omni-flash-1-1, video, 10s 720p no video input",
    interfaceType: "video",
    provider: "Google",
    creditPrice: "126",
    creditUnit: "per video",
    usdPrice: "0.63",
    anchor: "https://kie.ai/gemini-omni-1-1-flash",
  },
  {
    modelDescription: "google/gemini-omni-flash-1-1, video, 720p with video input",
    interfaceType: "video",
    provider: "Google",
    creditPrice: "168",
    creditUnit: "per video",
    usdPrice: "0.84",
    anchor: "https://kie.ai/gemini-omni-1-1-flash",
  },
  {
    modelDescription: "seedream 4.5, image-to-image",
    interfaceType: "image",
    provider: "ByteDance",
    creditPrice: "6.5",
    creditUnit: "per image",
    usdPrice: "0.0325",
    anchor: "https://kie.ai/seedream-4-5?model=seedream%2F4.5-edit",
  },
  {
    modelDescription: "Google nano banana 2, 4K",
    interfaceType: "image",
    provider: "Google",
    creditPrice: "18",
    creditUnit: "per image",
    usdPrice: "0.09",
    anchor: "https://kie.ai/nano-banana-2",
  },
  {
    modelDescription: "Google nano banana 2, 2K",
    interfaceType: "image",
    provider: "Google",
    creditPrice: "12",
    creditUnit: "per image",
    usdPrice: "0.06",
    anchor: "https://kie.ai/nano-banana-2",
  },
  {
    modelDescription: "Google nano banana 2, 1K",
    interfaceType: "image",
    provider: "Google",
    creditPrice: "8",
    creditUnit: "per image",
    usdPrice: "0.04",
    anchor: "https://kie.ai/nano-banana-2",
  },
  {
    modelDescription: "Black Forest Labs flux-2 pro, image to image, 1.0s-2K",
    interfaceType: "image",
    provider: "Black Forest Labs",
    creditPrice: "7.0",
    creditUnit: "per image",
    usdPrice: "0.035",
    anchor: "https://kie.ai/flux-2?model=flux-2%2Fpro-image-to-image",
  },
  {
    modelDescription: "Black Forest Labs flux-2 pro, image to image, 1.0s-1K",
    interfaceType: "image",
    provider: "Black Forest Labs",
    creditPrice: "5.0",
    creditUnit: "per image",
    usdPrice: "0.025",
    anchor: "https://kie.ai/flux-2?model=flux-2%2Fpro-image-to-image",
  },
  {
    modelDescription: "hailuo 2.3, image-to-video, Standard-6.0s-768p",
    interfaceType: "video",
    provider: "Hailuo",
    creditPrice: "30.0",
    creditUnit: "per video",
    usdPrice: "0.15",
    anchor: "https://kie.ai/hailuo-2-3?model=hailuo%2F2-3-image-to-video-standard",
  },
  {
    modelDescription: "ideogram character, image-to-image, BALANCED",
    interfaceType: "image",
    provider: "Ideogram",
    creditPrice: "18.0",
    creditUnit: "per image",
    usdPrice: "0.09",
    anchor: "https://kie.ai/ideogram/character",
  },
  {
    modelDescription: "ideogram character, image-to-image, QUALITY",
    interfaceType: "image",
    provider: "Ideogram",
    creditPrice: "24.0",
    creditUnit: "per image",
    usdPrice: "0.12",
    anchor: "https://kie.ai/ideogram/character?model=ideogram%2Fcharacter",
  },
  {
    modelDescription: "ideogram character, image-to-image, TURBO",
    interfaceType: "image",
    provider: "Ideogram",
    creditPrice: "12.0",
    creditUnit: "per image",
    usdPrice: "0.06",
    anchor: "https://kie.ai/ideogram/character?model=ideogram%2Fcharacter",
  },
  {
    modelDescription: "wan 2.7 video, image-to-video, 720p",
    interfaceType: "video",
    provider: "Alibaba",
    creditPrice: "16",
    creditUnit: "per second",
    usdPrice: "0.08",
    anchor: "https://kie.ai/wan-2-7-video?model=wan%2F2-7-image-to-video",
  },
  {
    modelDescription: "wan 2.7 video, image-to-video, 1080p",
    interfaceType: "video",
    provider: "Alibaba",
    creditPrice: "24",
    creditUnit: "per second",
    usdPrice: "0.12",
    anchor: "https://kie.ai/wan-2-7-video?model=wan%2F2-7-image-to-video",
  },
  /**
   * **Modelos de canto** (0.29.0), transcritos literalmente de la descarga real del 2026-09-29, erratas del
   * proveedor incluidas («Avtar», «secondss»): son justo lo que la traducción tiene que saber digerir.
   *
   * Los tres casos que hay que distinguir están aquí:
   *
   * - InfiniteTalk con sus **dos resoluciones** y un `anchor` **sin `model=`**, así que su identificador sale de
   *   la tabla de páginas (`/infinitalk` → `infinitalk/from-audio`);
   * - Kling AI Avatar **Standard**, con su `model=` en el ancla y su calificador de calidad;
   * - Kling AI Avatar **Pro**, que es **otro modelo** y no una variante del anterior: esta instalación no sabe
   *   pedirlo, así que tiene que entrar sin poder elegirse en lugar de colarse como si fuera el Standard.
   */
  {
    modelDescription: "MeiGen-AI InfiniteTalk, lip sync, up to 15 secondss-480p",
    interfaceType: "video",
    provider: "Other",
    creditPrice: "3.0",
    creditUnit: "per second",
    usdPrice: "0.015",
    anchor: "https://kie.ai/infinitalk",
  },
  {
    modelDescription: "MeiGen-AI InfiniteTalk, lip sync, up to 15 secondss-720p",
    interfaceType: "video",
    provider: "Other",
    creditPrice: "12.0",
    creditUnit: "per second",
    usdPrice: "0.06",
    anchor: "https://kie.ai/infinitalk",
  },
  {
    modelDescription: "Kling AI Avtar , lip sync, Standard-up to 15 secondss-720p",
    interfaceType: "video",
    provider: "Kling",
    creditPrice: "8.0",
    creditUnit: "per second",
    usdPrice: "0.04",
    anchor: "https://kie.ai/kling-ai-avatar?model=kling%2Fv1-avatar-standard",
  },
  {
    modelDescription: "Kling AI Avtar , lip sync, Pro-up to 15 secondss-1080p",
    interfaceType: "video",
    provider: "Kling",
    creditPrice: "16.0",
    creditUnit: "per second",
    usdPrice: "0.08",
    anchor: "https://kie.ai/kling-ai-avatar?model=kling%2Fai-avatar-v1-pro",
  },
];

export const RECUENTO = { all: REGISTROS_DE_PRECIO.length, image: 0, video: 0, music: 0, chat: 0 };

/** Sobre de KIE: siempre HTTP 200, y el error de verdad va en `code`. */
const sobre = (data: unknown) =>
  new Response(JSON.stringify({ code: 200, msg: "success", data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

/**
 * Buscador que responde con los registros grabados, paginando como el proveedor. `registros` permite probar
 * qué pasa cuando cambia un precio sin tocar el resto del fichero.
 */
export function buscadorDePrecios(registros: RegistroDePrecio[] = REGISTROS_DE_PRECIO) {
  const llamadas = { recuento: 0, paginas: 0 };
  const buscar = async (url: string, opciones: RequestInit): Promise<Response> => {
    if (url.endsWith("/count")) {
      llamadas.recuento++;
      return sobre({ all: registros.length, image: 0, video: 0, music: 0, chat: 0 });
    }
    if (!url.endsWith("/page")) throw new Error(`El test no esperaba esta llamada: ${url}`);
    llamadas.paginas++;
    const { pageNum, pageSize } = JSON.parse(String(opciones.body)) as { pageNum: number; pageSize: number };
    const desde = (pageNum - 1) * pageSize;
    return sobre({
      records: registros.slice(desde, desde + pageSize),
      total: registros.length,
      pages: Math.max(1, Math.ceil(registros.length / pageSize)),
    });
  };
  return { buscar, llamadas };
}
