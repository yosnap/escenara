import { asc, eq } from "drizzle-orm";
import { guionConHook, HOOK_MAXIMO, SIN_GUION_QUE_ENCABEZAR } from "@/lib/anuncio-guion";
import { limpiarTextoDePrompt } from "@/lib/ficha-personaje";
import { proyectoPropio } from "../asistente/consulta";
import { editarEscena } from "../asistente/escenas";
import { db } from "../db/cliente";
import { type FilaEscena, scenes } from "../db/esquema-proyectos";
import { leerCatalogoDeDireccion, nombreDePreset } from "../direccion/catalogo";
import type { Actor } from "../media/servicio";
import { ErrorAnuncio } from "./errores";

/**
 * **El hook elegido se convierte en la primera frase del guion** (decisión 10 de la fase).
 *
 * No hay campo «hook» en ninguna tabla, y es lo que esta versión decidió a propósito: el hook **es** el primer
 * turno del guion. Así la dirección del clip (0.25.0) lo consume como consume el resto del guion, y no hay dos
 * copias del mismo dato esperando a desincronizarse (riesgo de la fase: «duplicar el hook en dos sitios»).
 *
 * Lo mismo con su arranque de cámara: si el hook propone un movimiento o un gesto, se escriben en las **columnas
 * de dirección de la escena** —las que ya existen desde 0.25.0—, no en un sitio nuevo. Y solo si la escena no
 * tenía nada elegido: lo que la persona dirigió a mano manda sobre lo que propone un modelo.
 *
 * Es gratis y es idempotente: aplicar dos veces el mismo hook deja el mismo guion, no un guion que se repite.
 */

export interface HookElegido {
  texto: unknown;
  /** Clave del catálogo `camara` que propuso el hook; vacía o ausente = no se toca la cámara de la escena. */
  camara?: unknown;
  /** Clave del catálogo `microaccion`; vacía o ausente = no se toca el gesto. */
  gesto?: unknown;
}

export interface HookAplicado {
  escenaId: string;
  /** El guion de la primera escena, ya con el hook delante. */
  guion: string;
  /**
   * Qué llegó de verdad a la dirección de la escena, con el nombre que la persona lee en el botón. Vacío cuando
   * el hook no proponía nada o cuando la escena ya tenía algo elegido, que no se pisa.
   */
  camara: string;
  gesto: string;
  /** Por qué no se cambió la dirección, cuando el hook proponía algo. Vacío si se aplicó o si no proponía nada. */
  motivoSinDireccion: string;
}

/** Clave de preset tal como se acepta del navegador: no es texto libre y no viaja al prompt. */
function claveLimpia(valor: unknown): string {
  if (typeof valor !== "string") return "";
  const limpia = valor.trim().toLowerCase().slice(0, 64);
  return /^[a-z0-9-]*$/.test(limpia) ? limpia : "";
}

/** La primera escena del proyecto, que es la que empieza el vídeo y por tanto la que lleva el hook. */
async function primeraEscena(proyectoId: string): Promise<FilaEscena | null> {
  const [escena] = await db()
    .select()
    .from(scenes)
    .where(eq(scenes.projectId, proyectoId))
    .orderBy(asc(scenes.sortOrder))
    .limit(1);
  return escena ?? null;
}

/**
 * Escribe el hook elegido como primera frase del guion del proyecto y lleva su arranque a la dirección.
 *
 * El texto del hook llega del navegador y pasa por **la misma limpieza anti-inyección** que cualquier guion
 * escrito a mano: da lo mismo que lo haya propuesto un modelo o lo haya reescrito la persona, porque en los dos
 * casos es contenido del guion y no instrucciones. El movimiento y el gesto llegan como **claves**, y una que no
 * esté en el catálogo de esta instalación se trata como «no elegido» (ADR-0022).
 *
 * No se comprueba el interruptor del brief: la llamada que propuso este hook ya está pagada, y apagar el brief
 * en Admin no puede impedir usar lo que alguien pagó. Lo que el interruptor apaga es escribir briefs nuevos.
 */
export async function aplicarHook(actor: Actor, proyectoId: unknown, elegido: HookElegido): Promise<HookAplicado> {
  const proyecto = await proyectoPropio(actor, proyectoId);
  const hook = limpiarTextoDePrompt(elegido.texto, HOOK_MAXIMO).trim();
  if (hook === "") {
    throw new ErrorAnuncio(400, "Elige un hook: es la frase con la que arranca el vídeo, y no puede estar vacía.");
  }
  const escena = await primeraEscena(proyecto.id);
  if (!escena) throw new ErrorAnuncio(409, SIN_GUION_QUE_ENCABEZAR);

  const camaraPedida = claveLimpia(elegido.camara);
  const gestoPedido = claveLimpia(elegido.gesto);
  const catalogo = await leerCatalogoDeDireccion(actor.id);
  // Una clave que ya no esté activa en el catálogo no se guarda: vale lo mismo que no haber elegido nada.
  const camara = nombreDePreset(catalogo, "camara", camaraPedida) === "" ? "" : camaraPedida;
  const gesto = nombreDePreset(catalogo, "microaccion", gestoPedido) === "" ? "" : gestoPedido;

  /**
   * Lo que la persona ya dirigió **no se pisa**. Si la escena tiene cámara o gesto elegidos, el arranque del hook
   * se queda como sugerencia y se dice por qué: sobrescribir su dirección con lo que propuso un modelo sería
   * cambiarle el plano sin preguntar.
   */
  const camaraOcupada = escena.cameraMove !== "";
  const gestoOcupado = escena.microAction !== "";
  const pisaria = (camara !== "" && camaraOcupada) || (gesto !== "" && gestoOcupado);
  const aplicaCamara = camara !== "" && !camaraOcupada;
  const aplicaGesto = gesto !== "" && !gestoOcupado;

  const actualizada = await editarEscena(actor, escena.id, {
    texto: guionConHook(hook, escena.scriptText),
    ...(aplicaCamara ? { camara } : {}),
    ...(aplicaGesto ? { microaccion: gesto } : {}),
    // El gesto del hook ocurre **al arrancar**, antes de que se diga la frase: es lo que abre el vídeo.
    ...(aplicaGesto ? { momentoMicroaccion: "antes" as const } : {}),
  });

  return {
    escenaId: actualizada.id,
    guion: actualizada.scriptText,
    camara: nombreDePreset(catalogo, "camara", actualizada.cameraMove),
    gesto: nombreDePreset(catalogo, "microaccion", actualizada.microAction),
    motivoSinDireccion: pisaria
      ? "Esta escena ya tenía movimiento de cámara o gesto elegidos, así que se han dejado como estaban: el hook solo ha cambiado el guion. Si quieres el arranque que propone, cámbialos tú en la dirección de la escena."
      : "",
  };
}
