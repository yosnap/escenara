/**
 * Respuestas **grabadas** del proveedor (KIE) y del modelo de texto para el camino feliz de extremo a extremo.
 *
 * Son datos, no código de producción: el test de integración las sirve desde un `fetch` propio, así que ninguna
 * llamada sale de la máquina y no se gasta un solo crédito. Los cuerpos imitan lo que devuelve KIE de verdad:
 * el sobre `{ code, msg, data }`, `createTask` con su `taskId`, `recordInfo` con `state` y `resultJson`, y la
 * respuesta del modelo de texto con su `output` y sus créditos consumidos.
 */

/** Sobre estándar de KIE: todo lo suyo llega con `code`, `msg` y `data`, también los errores. */
export function sobreKie(data: unknown): Response {
  return new Response(JSON.stringify({ code: 200, msg: "success", data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/** Saldo de créditos que informa la cuenta del usuario en el proveedor. */
export const SALDO_KIE = 1_000_000;

/** URL temporal que devuelve KIE al subir una referencia antes de generar. */
export const SUBIDA_KIE = "https://tempfile.kie.ai/referencia-camino-feliz.png";

/** Resultado de un fotograma: el test lo descarga con su `descargar` simulado, sin salir a la red. */
export const URL_FOTOGRAMA = "https://tempfile.kie.ai/camino-feliz-fotograma.png";

/** Resultado de un clip: mismo camino, y el archivo es un MP4 de verdad hecho con FFmpeg. */
export const URL_CLIP = "https://tempfile.kie.ai/camino-feliz-clip.mp4";

/**
 * Créditos que el proveedor informa por cada trabajo terminado. Van por debajo de la estimación a propósito: es lo
 * normal, y así el cierre del gasto no apunta un exceso que aquí no se está probando.
 */
export const CREDITOS_CONSUMIDOS = 3;

/** `recordInfo` de una tarea que todavía no ha terminado. */
export const TAREA_EN_MARCHA = { state: "waiting", failMsg: "" };

/** `recordInfo` de una tarea terminada bien, con sus URL de resultado y los créditos que informa el proveedor. */
export function tareaTerminada(urls: readonly string[], creditos: number) {
  return {
    state: "success",
    resultJson: JSON.stringify({ resultUrls: urls }),
    creditsConsumed: creditos,
    failMsg: "",
  };
}

/** Créditos que el modelo de texto informa como consumidos en la llamada del guion. */
export const CREDITOS_TEXTO_INFORMADOS = 1.5;

/** Créditos que se confirman al pedir el guion: el precio sembrado es 1,5 y la estimación redondea al alza. */
export const CREDITOS_TEXTO_CONFIRMADOS = 2;

/** Sello de la estimación del modelo de texto sembrado en la instalación. */
export const SELLO_TEXTO = "kie:gpt-5-6-sol:respuesta de texto@v1";

/** Modelo de texto de la semilla que quien administra marca como compatible antes de usar el asistente. */
export const MODELO_TEXTO = "gpt-5-6-sol";

/** Segundos de cada escena del guion: son los que dura el clip grabado, para que la revisión los dé por buenos. */
export const SEGUNDOS_POR_ESCENA = 4;

/**
 * Guion que «propone» el modelo: dos escenas limpias, sin promesas de salud ni intentos de inyección. Aquí se
 * prueba el camino feliz, y una afirmación por verificar bloquearía la aprobación del plan a propósito.
 */
export const GUION_GRABADO = {
  concepto: "Dos momentos de una mañana tranquila en casa, con luz suave y sin prisa.",
  escenas: [
    {
      texto: "La mañana empieza despacio junto a la ventana.",
      accion: "Plano medio junto a la ventana, sonríe a cámara con luz suave",
      segundos: SEGUNDOS_POR_ESCENA,
    },
    {
      texto: "El café humea mientras suena la calle de fondo.",
      accion: "Plano cercano de las manos preparando un café humeante",
      segundos: SEGUNDOS_POR_ESCENA,
    },
  ],
};

/** Respuesta del modelo de texto tal como la devuelve el proveedor, con el guion dentro del mensaje. */
export function respuestaDeTexto(contenido: string = JSON.stringify(GUION_GRABADO)): Response {
  return new Response(
    JSON.stringify({
      output: [
        { type: "reasoning", content: [] },
        { type: "message", content: [{ type: "output_text", text: contenido }] },
      ],
      usage: { input_tokens: 140, output_tokens: 320 },
      credits_consumed: CREDITOS_TEXTO_INFORMADOS,
      status: "completed",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
