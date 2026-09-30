import { eq } from "drizzle-orm";
import { escenaSinAudio } from "@/lib/audio-del-clip";
import {
  componerSubtitulos,
  type EscenaConSubtitulos,
  erroresDeSubtitulos,
  type FormatoSubtitulos,
  SUBTITULO_MAXIMO,
  SUBTITULOS_MAXIMOS,
  type Subtitulo,
  subtitulosDesdeTexto,
  subtitulosDesdeTranscripcion,
} from "@/lib/voz";
import { escenaPropia, escenasDe, proyectoPropio } from "../asistente/consulta";
import { ErrorProyecto } from "../asistente/errores";
import { db } from "../db/cliente";
import { type FilaEscena, type FilaMedio, type FilaProyecto, media, scenes } from "../db/esquema";
import { transcribirPorMapa } from "../mapa/transcripcion";
import { type Actor, aDto } from "../media/servicio";
import { escenaInvalidada, firmaVigente } from "./proyecto";
import { BYTES_MAXIMOS_TRANSCRIPCION } from "./transcripcion";

/**
 * Subtítulos de las escenas (RF08, 0.21.0).
 *
 * Dos reglas gobiernan este fichero:
 *
 * 1. **lo que se exporta son los subtítulos editados**, nunca la transcripción cruda. La transcripción se guarda
 *    aparte (`scenes.transcript`) y sirve para proponer; lo que se publica es lo que la persona ha corregido;
 * 2. **no se inventa nada**. Sin transcriptor instalado no hay subtítulos automáticos y se dice por qué; sin audio
 *    no se transcribe; y el reparto de tiempos a partir del texto se hace **en proporción a los caracteres**, que
 *    es lo más que se puede afirmar sin medir el audio, y se dice que es una propuesta.
 *
 * Transcribir **no cuesta nada y no sale de la máquina** (transcriptor local), así que aquí no hay ni estimación,
 * ni confirmación de coste, ni un solo apunte en el registro de gasto.
 */

/** El archivo del que se saca la transcripción: la pista de voz si la hay y, si no, el clip. */
function origenDeLaTranscripcion(proyecto: FilaProyecto, escena: FilaEscena): { id: string; que: string } {
  if (proyecto.voiceMode === "pista") {
    if (!escena.voiceMediaId) {
      throw new ErrorProyecto(
        409,
        "Esta escena todavía no tiene su pista de voz. Genérala antes de sacar sus subtítulos.",
      );
    }
    return { id: escena.voiceMediaId, que: "la pista de voz" };
  }
  if (escena.clipAudioMuted) {
    throw new ErrorProyecto(
      409,
      "El audio del clip de esta escena está quitado, así que no se oye nada que subtitular. Vuelve a activarlo en el paso Escenas del proyecto o ponle una pista de voz aparte. No se ha cobrado nada.",
    );
  }
  if (!escena.clipMediaId) {
    throw new ErrorProyecto(
      409,
      "Esta escena todavía no tiene clip. En este proyecto la voz va dentro del clip, así que los subtítulos salen de su audio: prodúcela antes.",
    );
  }
  return { id: escena.clipMediaId, que: "el clip" };
}

/**
 * Corte temprano por tamaño, con lo que dice la ficha del medio. El de verdad lo pone `transcribir`, que cuenta los
 * bytes **al escribirlos**; este solo evita empezar a bajar algo que ya se sabe que no cabe, y decirlo con un
 * mensaje de esta pantalla en lugar de con uno del transcriptor.
 */
function exigirArchivoTranscribible(fila: FilaMedio): void {
  if (fila.sizeBytes > BYTES_MAXIMOS_TRANSCRIPCION) {
    throw new ErrorProyecto(
      413,
      `Ese archivo pesa demasiado para transcribirlo aquí (el máximo son ${Math.round(BYTES_MAXIMOS_TRANSCRIPCION / (1024 * 1024))} MB). Escribe los subtítulos a mano o propónlos desde el diálogo.`,
    );
  }
}

/**
 * Qué firma le toca a la escena después de tocar sus **subtítulos**.
 *
 * La firma es una sola para el audio y para los subtítulos, así que escribirla desde aquí sin mirar borraría la
 * invalidación del audio: una escena cuyo audio se generó con otra voz volvería a darse por vigente solo porque
 * alguien corrigió una línea de texto, la pantalla dejaría de pedir regenerarla y `exigirEscenaSinVoz` se negaría
 * a hacerlo. El montaje final saldría con un plano en la voz antigua.
 *
 * Por eso: si la escena **tiene audio y ese audio ya no corresponde**, se conservan tal cual la firma y el motivo
 * de invalidación. La invalidación solo la limpia quien la arregla, que es regenerar el audio con la voz vigente
 * (`produccion/cierre.ts`).
 *
 * La pregunta «¿está invalidada?» se le hace a {@link escenaInvalidada}, que es quien la responde en todas partes,
 * en lugar de repetirla aquí con otras palabras. Eso hace que la regla valga para los **dos modos**: en `pista` el
 * audio es la pista generada y en `clip` la voz vive dentro del propio clip, donde `voiceMediaId` es siempre
 * `null`. Mirar solo la pista dejaba el modo `clip` con el mismo agujero: corregir el diálogo y pulsar «proponer
 * subtítulos» daba la escena por vigente mientras el clip seguía diciendo la frase antigua en la imagen.
 */
function firmaTrasEditarSubtitulos(
  proyecto: FilaProyecto,
  escena: FilaEscena,
): Pick<FilaEscena, "voiceSignature" | "voiceInvalidationReason"> {
  if (escenaInvalidada(proyecto, escena)) {
    return { voiceSignature: escena.voiceSignature, voiceInvalidationReason: escena.voiceInvalidationReason };
  }
  return { voiceSignature: firmaVigente(proyecto, escena), voiceInvalidationReason: "" };
}

/**
 * Unos subtítulos que ha corregido una persona **no se pisan sin más**. Transcribir o proponer es barato y se
 * pulsa sin pensar; media hora de ajuste de tiempos no se recupera de ninguna parte, porque lo editado no se
 * guarda en ningún otro sitio (`transcript` conserva lo medido, no lo corregido).
 */
function exigirSobrescribirSubtitulos(escena: FilaEscena, confirmado: boolean, que: string): void {
  if (confirmado) return;
  if (escena.subtitlesEditedAt === null || escena.subtitles.length === 0) return;
  throw new ErrorProyecto(
    409,
    `Los subtítulos de la escena ${escena.sortOrder} los has corregido a mano y ${que} los sustituye por completo. Lo que has editado no se guarda en ningún otro sitio: confírmalo para sustituirlos.`,
  );
}

/**
 * Transcribe el audio de una escena y **propone** sus subtítulos. Guarda las dos cosas: la transcripción tal como
 * la midió el transcriptor y los subtítulos propuestos, que quedan a la espera de que alguien los revise.
 *
 * No marca los subtítulos como editados: nadie los ha mirado todavía. Lo que se exporta sigue siendo esta columna,
 * pero la pantalla dice claramente que aún no los ha revisado ninguna persona.
 */
export async function transcribirEscena(
  actor: Actor,
  escenaId: string,
  confirmarSobrescribir = false,
): Promise<FilaEscena> {
  const { escena, proyecto } = await escenaPropia(actor, escenaId);
  exigirSobrescribirSubtitulos(escena, confirmarSobrescribir, "transcribir el audio");
  const { id, que } = origenDeLaTranscripcion(proyecto, escena);
  const [fila] = await db().select().from(media).where(eq(media.id, id)).limit(1);
  if (!fila || fila.deletedAt !== null) {
    throw new ErrorProyecto(409, `Ya no está el archivo del que salían los subtítulos de esta escena (${que}).`);
  }
  exigirArchivoTranscribible(fila);
  const extension = (fila.originalName.split(".").pop() ?? "").toLowerCase();
  // Se le pasa la **clave del almacenamiento**, no el archivo: así va del almacenamiento al disco por trozos y no
  // se materializa nunca entero en memoria.
  const segmentos = await transcribirPorMapa({
    usuarioId: actor.id,
    claveAlmacenamiento: fila.storageKey,
    extension,
  });
  const propuestos = acotarSubtitulos(subtitulosDesdeTranscripcion(segmentos));
  const [guardada] = await db()
    .update(scenes)
    .set({
      transcript: segmentos,
      subtitles: propuestos,
      ...firmaTrasEditarSubtitulos(proyecto, escena),
      // Nadie los ha revisado todavía: `subtitlesEditedAt` vuelve a `null`, porque estos ya no son los editados.
      subtitlesEditedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(scenes.id, escena.id))
    .returning();
  if (!guardada) throw new ErrorProyecto(404, "Esa escena no existe.");
  return guardada;
}

/**
 * Propone subtítulos **a partir del texto del diálogo** y de los segundos de la escena, sin transcribir. Es el
 * camino cuando no hay transcriptor instalado o cuando el audio aún no está: reparte el tiempo en proporción a los
 * caracteres de cada frase, y la pantalla dice que es una propuesta que hay que ajustar.
 */
export async function proponerSubtitulos(
  actor: Actor,
  escenaId: string,
  confirmarSobrescribir = false,
): Promise<FilaEscena> {
  const { escena, proyecto } = await escenaPropia(actor, escenaId);
  exigirSobrescribirSubtitulos(escena, confirmarSobrescribir, "proponerlos desde el diálogo");
  if (escena.scriptText.trim() === "") {
    throw new ErrorProyecto(409, "Esta escena no tiene diálogo, así que no hay texto del que sacar subtítulos.");
  }
  const propuestos = acotarSubtitulos(subtitulosDesdeTexto(escena.scriptText, escena.plannedSeconds));
  const [guardada] = await db()
    .update(scenes)
    .set({
      subtitles: propuestos,
      ...firmaTrasEditarSubtitulos(proyecto, escena),
      subtitlesEditedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(scenes.id, escena.id))
    .returning();
  if (!guardada) throw new ErrorProyecto(404, "Esa escena no existe.");
  return guardada;
}

/** Acota la lista a lo que la pantalla puede manejar: un subtítulo por frase, no un archivo de subtítulos entero. */
function acotarSubtitulos(subtitulos: readonly Subtitulo[]): Subtitulo[] {
  return subtitulos.slice(0, SUBTITULOS_MAXIMOS).map((s) => ({ ...s, texto: s.texto.slice(0, SUBTITULO_MAXIMO) }));
}

/**
 * Guarda los subtítulos que ha editado una persona. **Es lo que se exporta**, así que aquí se exigen los tiempos:
 * un subtítulo que acaba antes de empezar o que se solapa con el anterior no se guarda, y se dice cuál.
 *
 * Los avisos de legibilidad (línea larga, tres líneas, demasiado rápido) **no bloquean**: quien edita puede tener
 * razones, y un editor que no deja guardar por un aviso es un editor que se sortea escribiendo peor.
 */
export async function guardarSubtitulos(
  actor: Actor,
  escenaId: string,
  subtitulos: readonly Subtitulo[],
): Promise<FilaEscena> {
  const { escena, proyecto } = await escenaPropia(actor, escenaId);
  const errores = erroresDeSubtitulos(subtitulos);
  if (errores.length > 0) throw new ErrorProyecto(400, errores.join(" "));
  const [guardada] = await db()
    .update(scenes)
    .set({
      subtitles: acotarSubtitulos(subtitulos),
      subtitlesEditedAt: new Date(),
      ...firmaTrasEditarSubtitulos(proyecto, escena),
      updatedAt: new Date(),
    })
    .where(eq(scenes.id, escena.id))
    .returning();
  if (!guardada) throw new ErrorProyecto(404, "Esa escena no existe.");
  return guardada;
}

/**
 * Fichero de subtítulos del proyecto entero, en SRT o en WebVTT, **desde los subtítulos editados**.
 *
 * Los tiempos se corren escena a escena con los segundos de cada una, que es el orden en el que se montará el
 * vídeo. Un proyecto sin ni un subtítulo guardado no se exporta: un archivo vacío parecería un proyecto sin
 * diálogo.
 */
export async function exportarSubtitulos(
  actor: Actor,
  proyectoId: string,
  formato: FormatoSubtitulos,
): Promise<{ nombre: string; contenido: string }> {
  const proyecto = await proyectoPropio(actor, proyectoId);
  const escenas = await escenasDe(proyecto.id);
  const conSubtitulos: EscenaConSubtitulos[] = escenas.map((escena) => ({
    orden: escena.sortOrder,
    segundos: escena.plannedSeconds,
    // La escena que entra en silencio no se subtitula: sería texto de algo que no se oye.
    subtitulos: escenaSinAudio(escena, proyecto.voiceMode) ? [] : escena.subtitles,
  }));
  if (conSubtitulos.every((e) => e.subtitulos.length === 0)) {
    throw new ErrorProyecto(
      409,
      "Este proyecto todavía no tiene ningún subtítulo guardado. Genera o escribe los subtítulos de sus escenas antes de exportarlos.",
    );
  }
  // El nombre viaja en una cabecera ASCII, así que se quitan las tildes y se deja solo lo que cabe ahí. Un
  // `Content-Disposition` con letras no ASCII lo interpreta cada navegador a su manera.
  const slug = proyecto.title
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return {
    nombre: `${slug === "" ? "proyecto" : slug}.${formato}`,
    contenido: componerSubtitulos(conSubtitulos, formato),
  };
}

/** Medio en forma de DTO, para que la pantalla pueda reproducirlo con su URL temporal de siempre. */
export async function medioDeEscena(actor: Actor, id: string | null) {
  if (!id) return null;
  const [fila] = await db().select().from(media).where(eq(media.id, id)).limit(1);
  return fila ? aDto(fila, actor) : null;
}
