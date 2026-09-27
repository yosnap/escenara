import { PROPORCION_DISPONIBLE, RESOLUCION_DISPONIBLE } from "@/lib/produccion";
import {
  type ComprobacionClip,
  type ComprobacionRevision,
  type ResultadoComprobacion,
  severidadDeComprobacion,
} from "@/lib/revision";
import { type MedidasClip, medirClip } from "./medicion";

/**
 * Comprobaciones técnicas del clip de una escena (RF07). **No cuestan un solo crédito**: se mide el archivo que ya
 * está en la biblioteca con ffprobe y ffmpeg, y se compara con lo que se pidió.
 *
 * Lo que este fichero **no** hace, y es lo más importante de él: decir si el personaje sigue siendo el mismo. Eso
 * no se mide en un contenedor MP4. La identidad la valida una persona (decisión provisional del propietario,
 * 2026-09-27) y la revisión multimodal de pago solo le añade una opinión.
 *
 * Todo lo que hay aquí es **puro sobre las medidas**, salvo `medidasDelArchivo`: así las comprobaciones se prueban
 * con clips diminutos hechos con ffmpeg y sin base de datos ni almacenamiento.
 */

/** Lo que se le pidió al modelo, que es contra lo que se compara lo medido. */
export interface PedidoDeClip {
  /** Segundos planificados de la escena. */
  segundos: number;
  /** Proporción pedida, tipo `9:16`. */
  proporcion: string;
  /** Resolución pedida, tipo `720p`. */
  resolucion: string;
}

/** Umbrales de la comprobación, tal como los fija Admin › Ajustes. */
export interface UmbralesRevision {
  toleranciaDuracion: number;
  segundosPlanosMaximos: number;
  exigirAudio: boolean;
}

/** Pedido por defecto de esta versión: lo único que se ofrece son clips de 4 s en 9:16 y 720p. */
export const pedidoDeEscena = (segundos: number): PedidoDeClip => ({
  segundos,
  proporcion: PROPORCION_DISPONIBLE,
  resolucion: RESOLUCION_DISPONIBLE,
});

const redondear = (n: number, decimales = 2): number => Math.round(n * 10 ** decimales) / 10 ** decimales;

const segundos = (n: number): string => `${redondear(n, 2)} s`;

/** Lado menor en píxeles que corresponde a una resolución tipo `720p`; `null` si no se reconoce. */
export function ladoMenorDeResolucion(resolucion: string): number | null {
  const encontrado = /^(\d{3,4})p$/.exec(resolucion.trim());
  const lado = Number.parseInt(encontrado?.[1] ?? "", 10);
  return Number.isFinite(lado) && lado > 0 ? lado : null;
}

/** Proporción pedida como número; `null` si no se reconoce. */
export function proporcionPedida(proporcion: string): number | null {
  const [ancho, alto] = proporcion.split(":").map((p) => Number.parseFloat(p));
  if (!Number.isFinite(ancho) || !Number.isFinite(alto) || (alto ?? 0) <= 0) return null;
  return (ancho as number) / (alto as number);
}

/**
 * Tolerancia de la proporción: **un píxel de redondeo**, no un margen de gusto. Un clip de 720 × 1280 da 0,5625
 * exacto; uno de 720 × 1278 da 0,5634. La diferencia relativa que se acepta es la que produce redondear el lado
 * mayor a un número par, que es lo que hacen todos los codificadores.
 */
const TOLERANCIA_PROPORCION = 0.02;

const comprobacion = (
  clave: ComprobacionClip,
  resultado: ResultadoComprobacion,
  medido: string,
  esperado: string,
  motivo: string,
): ComprobacionRevision => ({
  clave,
  resultado,
  severidad: severidadDeComprobacion(clave, resultado),
  medido,
  esperado,
  motivo,
});

function comprobarArchivo(medidas: MedidasClip): ComprobacionRevision {
  if (!medidas.tieneVideo) {
    return comprobacion(
      "archivo",
      "falla",
      "",
      "un vídeo legible con pista de imagen",
      "El archivo no se puede leer como vídeo o no tiene pista de imagen: está vacío o corrupto. Regenera la escena.",
    );
  }
  return comprobacion(
    "archivo",
    "pasa",
    "vídeo legible",
    "un vídeo legible con pista de imagen",
    "El clip se lee sin problemas.",
  );
}

function comprobarDuracion(
  medidas: MedidasClip,
  pedido: PedidoDeClip,
  umbrales: UmbralesRevision,
): ComprobacionRevision {
  const esperado = segundos(pedido.segundos);
  if (medidas.duracionSegundos === null) {
    return comprobacion(
      "duracion",
      "no_medible",
      "",
      esperado,
      "El archivo no informa de su duración, así que no se ha podido comprobar. Míralo tú antes de darlo por bueno.",
    );
  }
  const diferencia = Math.abs(medidas.duracionSegundos - pedido.segundos);
  const medido = segundos(medidas.duracionSegundos);
  if (diferencia > umbrales.toleranciaDuracion) {
    return comprobacion(
      "duracion",
      "falla",
      medido,
      esperado,
      `El clip dura ${medido} y la escena pedía ${esperado}. Un clip con otra duración desencaja el montaje: regenera la escena.`,
    );
  }
  return comprobacion("duracion", "pasa", medido, esperado, `El clip dura ${medido}, lo que se pedía.`);
}

function comprobarResolucion(medidas: MedidasClip, pedido: PedidoDeClip): ComprobacionRevision {
  const pedida = ladoMenorDeResolucion(pedido.resolucion);
  if (medidas.ancho === null || medidas.alto === null) {
    return comprobacion("resolucion", "no_medible", "", pedido.resolucion, "El archivo no informa de sus medidas.");
  }
  const menor = Math.min(medidas.ancho, medidas.alto);
  const medido = `${medidas.ancho} × ${medidas.alto} px`;
  if (pedida === null) {
    return comprobacion(
      "resolucion",
      "no_medible",
      medido,
      pedido.resolucion,
      `No se sabe a cuántos píxeles corresponde «${pedido.resolucion}», así que no se ha comparado.`,
    );
  }
  if (menor < pedida) {
    return comprobacion(
      "resolucion",
      "falla",
      medido,
      `al menos ${pedida} px de lado menor`,
      `El clip mide ${medido} y se pedía ${pedido.resolucion}, es decir, al menos ${pedida} px de lado menor. Ampliarlo después inventa detalle: regenera la escena.`,
    );
  }
  return comprobacion(
    "resolucion",
    "pasa",
    medido,
    pedido.resolucion,
    `El clip mide ${medido}: cumple ${pedido.resolucion}.`,
  );
}

function comprobarProporcion(medidas: MedidasClip, pedido: PedidoDeClip): ComprobacionRevision {
  const pedida = proporcionPedida(pedido.proporcion);
  if (medidas.ancho === null || medidas.alto === null) {
    return comprobacion("proporcion", "no_medible", "", pedido.proporcion, "El archivo no informa de sus medidas.");
  }
  const real = medidas.ancho / medidas.alto;
  const medido = `${redondear(real, 4)} (${medidas.ancho} × ${medidas.alto})`;
  if (pedida === null) {
    return comprobacion(
      "proporcion",
      "no_medible",
      medido,
      pedido.proporcion,
      `No se entiende la proporción «${pedido.proporcion}», así que no se ha comparado.`,
    );
  }
  if (Math.abs(real - pedida) / pedida > TOLERANCIA_PROPORCION) {
    return comprobacion(
      "proporcion",
      "falla",
      medido,
      `${pedido.proporcion} (${redondear(pedida, 4)})`,
      `El clip tiene proporción ${medido} y se pedía ${pedido.proporcion}. Recortarlo perdería parte de la imagen: regenera la escena.`,
    );
  }
  return comprobacion(
    "proporcion",
    "pasa",
    medido,
    pedido.proporcion,
    `El clip tiene la proporción ${pedido.proporcion} que se pedía.`,
  );
}

function comprobarAudio(medidas: MedidasClip, umbrales: UmbralesRevision): ComprobacionRevision {
  const medido = medidas.tieneAudio ? "con pista de audio" : "sin pista de audio";
  if (medidas.tieneAudio) {
    return comprobacion("audio", "pasa", medido, "con pista de audio", "El clip trae audio.");
  }
  if (!umbrales.exigirAudio) {
    return comprobacion(
      "audio",
      "pasa",
      medido,
      "no se exige",
      "El clip no trae audio. Esta instalación no lo exige, porque no todos los modelos de animación generan voz.",
    );
  }
  return comprobacion(
    "audio",
    "falla",
    medido,
    "con pista de audio",
    "El clip no trae audio y esta instalación lo exige. Elige un modelo con voz o regenera la escena.",
  );
}

function comprobarTramosPlanos(medidas: MedidasClip, umbrales: UmbralesRevision): ComprobacionRevision {
  const { segundosNegros, segundosCongelados } = medidas;
  const esperado = `menos de ${segundos(umbrales.segundosPlanosMaximos)} negros o congelados`;
  if (segundosNegros === null || segundosCongelados === null) {
    return comprobacion(
      "planos",
      "no_medible",
      "",
      esperado,
      "No se ha podido analizar el clip en busca de tramos negros o congelados. Míralo tú antes de darlo por bueno.",
    );
  }
  const medido = `${segundos(segundosNegros)} en negro y ${segundos(segundosCongelados)} congelados`;
  const peor = Math.max(segundosNegros, segundosCongelados);
  if (peor > umbrales.segundosPlanosMaximos) {
    return comprobacion(
      "planos",
      "falla",
      medido,
      esperado,
      `El clip tiene ${medido}, más de lo que esta instalación tolera. Puede ser un fallo del modelo: míralo y decide si lo regeneras.`,
    );
  }
  return comprobacion("planos", "pasa", medido, esperado, "No hay tramos negros ni congelados que destaquen.");
}

/**
 * Las seis comprobaciones a partir de unas medidas ya tomadas. Función **pura**: la misma entrada da siempre la
 * misma salida, así que se prueba con medidas inventadas y con las de un clip real sin cambiar nada.
 *
 * Si el archivo no se puede leer, se devuelve **solo** esa comprobación: enumerar cinco «no medible» detrás de un
 * clip corrupto no informa de nada y esconde lo único que importa.
 */
export function comprobacionesDeMedidas(
  medidas: MedidasClip,
  pedido: PedidoDeClip,
  umbrales: UmbralesRevision,
): ComprobacionRevision[] {
  const archivo = comprobarArchivo(medidas);
  if (archivo.resultado === "falla") return [archivo];
  return [
    archivo,
    comprobarDuracion(medidas, pedido, umbrales),
    comprobarResolucion(medidas, pedido),
    comprobarProporcion(medidas, pedido),
    comprobarAudio(medidas, umbrales),
    comprobarTramosPlanos(medidas, umbrales),
  ];
}

/** Mide un archivo del disco y lo compara con lo pedido. Es el camino que usan los tests con clips de ffmpeg. */
export async function comprobacionesDeArchivo(
  ruta: string,
  pedido: PedidoDeClip,
  umbrales: UmbralesRevision,
): Promise<ComprobacionRevision[]> {
  return comprobacionesDeMedidas(await medirClip(ruta), pedido, umbrales);
}
