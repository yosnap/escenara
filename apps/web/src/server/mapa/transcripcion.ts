import { mensajeDeFalloDeProveedor } from "@/lib/diagnostico-proveedor";
import type { Subtitulo } from "@/lib/voz";
import { leerObjeto } from "../almacenamiento";
import type { Buscador } from "../proveedores/codigos";
import { transcribirAudioCompatible } from "../proveedores/compatible/cliente";
import { BYTES_MAXIMOS_TRANSCRIPCION, ErrorTranscripcion, transcribir } from "../voz/transcripcion";
import { type EntradaResuelta, resolverMapa } from "./mapa";
import { clasificarFallo, recorrerMapa } from "./recorrido";

/**
 * Sacar los subtítulos del audio **recorriendo el mapa de transcripción** (0.21.1). Dos clases de entrada:
 *
 * - `local`: el binario de la instalación (`whisper.cpp`). **No cuesta nada y el audio no sale de la máquina**,
 *   así que es lo que se recomienda de fábrica y lo que va primero;
 * - un servicio compatible con la API de OpenAI (`POST {base}/audio/transcriptions`, modelo `whisper`
 *   comprobado el 2026-09-28): útil cuando la instalación no puede instalar el binario. Se paga por cuota del
 *   plan, no por petición, y **el audio sí sale de la máquina**: eso se dice en la pantalla del mapa.
 *
 * Ninguna entrada de aquí cobra por petición, así que el recorrido pasa a la siguiente con cualquier fallo.
 */

/** Lo más grande que se le manda a un servicio externo: NaN builders documenta un máximo de 25 MB. */
export const BYTES_MAXIMOS_REMOTOS = 25 * 1024 * 1024;

export interface PeticionTranscripcion {
  usuarioId: string;
  claveAlmacenamiento: string;
  /** Extensión del archivo original, para que el servicio sepa qué le llega. */
  extension: string;
  buscar?: Buscador;
}

/**
 * Transcribe recorriendo el mapa. Si ninguna entrada puede, lanza `ErrorTranscripcion` con **todas** las
 * probadas y su causa concreta.
 */
export async function transcribirPorMapa(peticion: PeticionTranscripcion): Promise<Subtitulo[]> {
  const entradas = (await resolverMapa(peticion.usuarioId, "transcripcion")).filter(
    (e) => e.proveedor === "local" || e.proveedor === "compatible",
  );
  const resultado = await recorrerMapa(entradas, (entrada) => intentar(peticion, entrada), clasificarFallo);
  if (resultado.ok) return resultado.valor;
  if (entradas.length === 0) {
    throw new ErrorTranscripcion(
      "Tu mapa de subtítulos no tiene ninguna entrada utilizable, así que no hay con qué transcribir. Revísalo en «Tu cuenta»; mientras tanto puedes proponer los subtítulos desde el diálogo o escribirlos a mano.",
      "El mapa de transcripción del usuario está vacío o ninguna entrada se puede resolver.",
      409,
    );
  }
  throw new ErrorTranscripcion(
    mensajeDeFalloDeProveedor(
      "No se han podido sacar los subtítulos del audio",
      resultado.intentos,
      "Ninguna de estas opciones cobra por petición, así que esto no te ha costado nada. Puedes proponer los subtítulos desde el diálogo o escribirlos a mano.",
    ),
    "Ninguna entrada del mapa de transcripción ha podido transcribir.",
    502,
  );
}

async function intentar(peticion: PeticionTranscripcion, entrada: EntradaResuelta): Promise<Subtitulo[]> {
  if (entrada.proveedor === "local") {
    return transcribir(peticion.claveAlmacenamiento, peticion.extension);
  }
  const servicio = entrada.compatible;
  if (!servicio) throw new ErrorTranscripcion("Esa entrada apunta a un servicio que ya no existe.");
  const bytes = await leerObjeto(peticion.claveAlmacenamiento).arrayBuffer();
  const audio = new Blob([bytes]);
  if (audio.size > BYTES_MAXIMOS_REMOTOS) {
    // No se manda: el servicio lo rechazaría igual y el audio habría salido de la máquina para nada.
    throw new ErrorTranscripcion(
      `Ese audio pesa más de ${Math.round(BYTES_MAXIMOS_REMOTOS / (1024 * 1024))} MB, que es el máximo que acepta ${servicio.nombre}.`,
      "El archivo pasa del tope del servicio remoto.",
      413,
    );
  }
  const segmentos = await transcribirAudioCompatible({
    urlBase: servicio.urlBase,
    clave: servicio.clave,
    modelo: entrada.modelo,
    audio,
    nombre: `audio.${peticion.extension.replace(/[^a-z0-9]/gi, "") || "bin"}`,
    buscar: peticion.buscar,
  });
  return segmentos.map((s) => ({ desde: s.inicio, hasta: s.fin, texto: s.texto }));
}

export { BYTES_MAXIMOS_TRANSCRIPCION };
