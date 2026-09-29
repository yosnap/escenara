import {
  type ModeloCanto,
  NOMBRE_MODELO_CANTO,
  RESOLUCIONES_CANTO,
  type ResolucionCanto,
  SEGUNDOS_CANTO_MAXIMOS,
} from "@/lib/canto";
import type { Capacidad, ParametrosModelo } from "@/lib/catalogo";
import type { TarifaPublicada } from "../contrato";
import type { TarifaTraducida } from "./correspondencia";

/**
 * **Familias de canto de KIE** (capacidad `audio_to_video`, 0.29.0): los modelos de lip-sync que animan un
 * retrato sincronizándolo con un audio que se les envía.
 *
 * Lo que los separa del resto de los modelos de vídeo, y por lo que tienen su propio fichero:
 *
 * 1. **el audio es obligatorio**. No saben animar una imagen sin él, así que declaran `audio_to_video` y no
 *    `image_to_video`: si compartieran capacidad, un clip normal podría acabar pidiéndose aquí y el proveedor lo
 *    rechazaría **después** de haber cobrado la petición;
 * 2. **el proveedor cobra por segundo**, no por clip. La tabla publicada de KIE da su tarifa como «per second»
 *    con el tramo «up to 15 seconds», así que el precio de un clip es la tarifa × los segundos del audio;
 * 3. **no aceptan `aspect_ratio`**. El formato del clip lo fija la imagen de partida, y por eso la proporción
 *    vertical se valida **antes** de gastar en lugar de pedírsela al modelo.
 *
 * Todo lo de aquí está leído en la documentación del modelo (`docs.kie.ai`) y en la tabla de precios pública de
 * KIE (`api.kie.ai/client/v1/model-pricing`, una API sin clave y sin coste), comprobadas el 2026-09-29. Nada se
 * escala ni se interpola de una resolución a otra: cada una tiene su tarifa publicada.
 */

/** Familia de canto: lo que esta instalación sabe de un modelo de lip-sync. */
export interface FamiliaDeCanto {
  nombre: string;
  /** Resoluciones cuya tarifa por segundo publica el proveedor, de la más barata a la más cara. */
  resoluciones: readonly ResolucionCanto[];
  /** Formatos de imagen que acepta como retrato de partida. */
  formatosRetrato: readonly string[];
  notas: string;
}

const DOCS = "Campos leídos en docs.kie.ai y tarifas en la tabla pública de precios de KIE, el 2026-09-29";

/** La biblioteca puede guardar WebP; el despacho lo convierte para Kling, que solo acepta JPEG o PNG. */
const FORMATOS_RETRATO = ["image/jpeg", "image/png", "image/webp"] as const;
const FORMATOS_RETRATO_KLING = ["image/jpeg", "image/png"] as const;

export const FAMILIAS_DE_CANTO = new Map<ModeloCanto, FamiliaDeCanto>([
  [
    "infinitalk/from-audio",
    {
      nombre: NOMBRE_MODELO_CANTO["infinitalk/from-audio"],
      // 480p primero: es la de por defecto y es cuatro veces más barata (3 frente a 12 créditos/s).
      resoluciones: ["480p", "720p"],
      formatosRetrato: FORMATOS_RETRATO,
      notas: `${DOCS} (kie.ai/infinitalk). Recibe «image_url», «audio_url» y «prompt»; no acepta «aspect_ratio», así que el formato del clip lo fija la imagen. Publica 3 créditos por segundo a 480p y 12 a 720p, en tramos de hasta 15 segundos. Precio publicado, no medido en esta instalación.`,
    },
  ],
  [
    "kling/v1-avatar-standard",
    {
      nombre: NOMBRE_MODELO_CANTO["kling/v1-avatar-standard"],
      // La tabla publicada solo tarifa 720p para la variante Standard: 1080p es la variante Pro, otro modelo.
      resoluciones: ["720p"],
      formatosRetrato: FORMATOS_RETRATO_KLING,
      notas: `${DOCS} (kie.ai/kling-ai-avatar?model=kling/v1-avatar-standard). Recibe «image_url», «audio_url» y «prompt»; tampoco acepta «aspect_ratio». Publica 8 créditos por segundo a 720p, en tramos de hasta 15 segundos. Precio publicado, no medido en esta instalación.`,
    },
  ],
]);

export const familiaDeCantoDe = (modelo: string): FamiliaDeCanto | undefined =>
  FAMILIAS_DE_CANTO.get(modelo as ModeloCanto);

export const esModeloDeCanto = (modelo: string): boolean => FAMILIAS_DE_CANTO.has(modelo as ModeloCanto);

/**
 * Unidad con la que se registra y se cobra un clip cantado de esa duración y resolución.
 *
 * **Nombra los segundos a propósito**, con la misma forma que las demás unidades de vídeo («clip de 8 s a
 * 720p»): así `segundosDeUnidad` la entiende y las tres barreras del dinero que ya existen siguen funcionando
 * sin tocarlas —la tarifa que se estima es la de esos segundos, la que se confirma lleva su sello, y el despacho
 * comprueba antes de enviar que el clip que va a pedir dura exactamente lo que se apartó—.
 */
export const unidadDeCanto = (segundos: number, resolucion: string): string =>
  `clip cantado de ${segundos} s a ${resolucion}`;

/** Resolución que nombra una unidad de canto, o `null` si no es una de ellas. */
export function resolucionDeUnidadDeCanto(unidad: string): ResolucionCanto | null {
  const encontrada = /^clip cantado de \d+ s a (.+)$/.exec(unidad.trim())?.[1];
  return RESOLUCIONES_CANTO.find((r) => r === encontrada) ?? null;
}

/** Tarifa por segundo que publica el proveedor para esa resolución; `null` si no publica ninguna. */
function creditosPorSegundo(tarifas: readonly TarifaTraducida[], resolucion: string): number | null {
  let mejor: number | null = null;
  for (const tarifa of tarifas) {
    // Solo las que se pagan **por segundo**: es la única unidad con la que se puede calcular el clip antes.
    if (tarifa.unidadPublicada.trim().toLowerCase() !== "per second") continue;
    if (tarifa.variante.resolucion.toLowerCase() !== resolucion.toLowerCase()) continue;
    // Dos registros para la misma resolución: se queda **el más caro**, igual que en imagen y en vídeo. Estimar
    // por lo alto solo hace confirmar de más; por lo bajo haría reservar menos de lo que después se cobra.
    if (mejor === null || tarifa.creditos > mejor) mejor = tarifa.creditos;
  }
  return mejor;
}

/**
 * Tarifas de un modelo de canto: **una por cada segundo facturable y cada resolución publicada**.
 *
 * Por qué una por duración y no una sola «por segundo»: porque así la duración que se elige es también la que se
 * confirma, la que se sella y la que se paga (ADR-0029 §6), que es lo mismo que se hizo en la 0.23.4 con las
 * cuatro duraciones de Gemini Omni. Registrar solo «el segundo» dejaría el clip sin unidad propia y el despacho
 * no podría comprobar antes de enviar que lo que va a pedir es lo que se apartó.
 *
 * Multiplicar la tarifa por los segundos **no es inventarse un precio**: es la unidad que el proveedor publica, y
 * el método está comprobado con dinero real en MiniMax H3 (8 créditos/s × 5 s = los 40 que cobró el 2026-09-28).
 * Lo que no se hace nunca es escalar de una resolución a otra: cada una trae la suya o no entra.
 *
 * El tope son {@link SEGUNDOS_CANTO_MAXIMOS} segundos porque es el tramo que publica el proveedor («up to 15
 * seconds»). Más allá de ahí no hay tarifa, así que no se ofrece: un precio que no se sabe antes no se confirma.
 */
export function tarifasDeCanto(familia: FamiliaDeCanto, tarifas: readonly TarifaTraducida[]): TarifaPublicada[] {
  const salida: TarifaPublicada[] = [];
  const referencia = tarifas[0]?.ancla ?? "";
  for (const resolucion of familia.resoluciones) {
    const porSegundo = creditosPorSegundo(tarifas, resolucion);
    if (porSegundo === null) continue;
    for (let segundos = 1; segundos <= SEGUNDOS_CANTO_MAXIMOS; segundos++) {
      salida.push({
        unidad: unidadDeCanto(segundos, resolucion),
        // Se redondea al alza porque es lo que se va a reservar: con 3 créditos/s sale exacto, y con una tarifa
        // decimal quedarse corto haría apartar menos de lo que el proveedor cobra.
        creditos: Math.ceil(porSegundo * segundos),
        referencia,
      });
    }
  }
  return salida;
}

/** Créditos por segundo de una resolución, deducidos de sus tarifas registradas. Solo para explicar la cifra. */
export const creditosPorSegundoDeTarifa = (creditos: number, segundos: number): number =>
  segundos > 0 ? Math.round((creditos / segundos) * 100) / 100 : 0;

/**
 * Parámetros del modelo de canto para el catálogo. Las duraciones son **los segundos facturables**, y no están
 * ahí por adorno: son lo que hace que el coste del trabajo se pueda acotar (`presupuesto/acotar.ts`) y por tanto
 * lo que evita que un clip cantado salga a la cola esperando un límite que el usuario ya ha confirmado.
 *
 * `proporciones` va **vacía** a propósito: estos modelos no aceptan `aspect_ratio`, y declarar «9:16» haría creer
 * que se le puede pedir el vertical cuando lo que lo fija es la imagen de partida.
 */
export function parametrosDeCanto(familia: FamiliaDeCanto): ParametrosModelo {
  return {
    duraciones: Array.from({ length: SEGUNDOS_CANTO_MAXIMOS }, (_, i) => i + 1),
    proporciones: [],
    resoluciones: [...familia.resoluciones],
    formatosReferencia: [...familia.formatosRetrato],
    // Un retrato y solo uno: `image_url` es un campo suelto, no una lista.
    maximoReferencias: 1,
  };
}

/** Capacidades de un modelo de canto. Una sola: sin audio no sabe hacer nada. */
export const CAPACIDADES_DE_CANTO: readonly Capacidad[] = ["audio_to_video"];
