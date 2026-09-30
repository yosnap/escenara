import { createHash } from "node:crypto";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { after } from "next/server";
import { veredictoDe } from "@/lib/coherencia";
import { coincideConLasReglas } from "@/lib/decisiones";
import { leerAjustes } from "../ajustes";
import { leerSecreto } from "../boveda/secretos";
import { HERRAMIENTAS_JEV } from "../coherencia/decidir";
import { decidirConJev, ErrorJev, type RespuestaJev } from "../coherencia/jev";
import type { SujetoControl } from "../controles/contrato";
import { db } from "../db/cliente";
import { shadowEvaluations } from "../db/esquema";
import { dentroDelLimite } from "../limite";
import type { Buscador } from "../proveedores/codigos";
import { evidenciaDeAfirmacion, PREGUNTA_AFIRMACION, VERSION_PREGUNTAS_SOMBRA } from "./preguntas-sombra";
import { textoParaLaSombra } from "./texto-sombra";

/**
 * **Sombra de las decisiones**: Jev opina sobre la misma petición que acaba de decidir el motor de reglas, y su
 * opinión se guarda para compararla después con lo que diga una persona.
 *
 * Cuatro invariantes de este fichero:
 *
 * 1. **fuera del camino crítico**: {@link lanzarSombra} no se espera. La puerta decide con las reglas, contesta y
 *    sigue; la sombra termina cuando termine. Si falla, tarda o revienta, se anota y ya: la decisión efectiva es la
 *    de las reglas y nadie espera a Jev;
 * 2. **apagada no llama a nadie**: sin la sombra encendida en Admin › Ajustes (y aceptado antes que TypeSafe es
 *    encargado del tratamiento) no se lee la clave, no se pregunta y no se gasta nada;
 * 2b. **sin personas reales**: una escena con un personaje real no se evalúa, y en las demás se quitan los nombres
 *    antes de enviar (`texto-sombra.ts`);
 * 3. **un fallo nunca es una opinión**: se guarda el código del fallo y el veredicto queda vacío;
 * 4. **nunca se enseña al usuario**: esta opinión solo la lee `/admin/decisiones`. Verla sesgaría la revisión
 *    humana, que es justo la etiqueta con la que se mide.
 */

/** Pregunta que se evalúa hoy. La otra de la sombra (el resultado) es la comprobación de coherencia de siempre. */
export const PREGUNTA = "afirmacion_verificable";

/**
 * Tope de espera de la sombra: **10 s**, la mitad del de la coherencia. Nadie la espera, pero una llamada colgada
 * sigue ocupando una conexión, y una opinión que llega tan tarde ya no dice nada del servicio que se mide.
 */
export const MS_SOMBRA = 10_000;

export interface PeticionSombra {
  evaluacionId: string;
  usuarioId: string;
  sujeto: SujetoControl;
  sujetoId: string | null;
  /**
   * Si saltó la regla equivalente del motor (afirmaciones sin verificar): es con lo que se compara la opinión.
   * `null` cuando la puerta no la evaluó (el clip no mira la escena).
   */
  reglaAfirmaciones: boolean | null;
  buscar?: Buscador;
  msMaximo?: number;
}

/** Qué pasó con una sombra. Solo lo usan los tests y el log: la puerta no lo lee nunca. */
export type DesenlaceSombra =
  | "apagada"
  | "sin-escena"
  | "persona-real"
  | "sin-texto"
  | "reutilizada"
  | "tope"
  | "sin-clave"
  | "fallida"
  | "evaluada";

const pendientes = new Set<Promise<unknown>>();

/**
 * Lanza la sombra **sin esperarla**. Cualquier error se queda aquí: ni una excepción, ni un rechazo sin atender,
 * llegan a la puerta que la lanzó.
 */
export function lanzarSombra(peticion: PeticionSombra): void {
  const tarea: Promise<unknown> = evaluarEnSombra(peticion)
    .catch((error) => {
      console.error(`[sombra] la evaluación en sombra ha fallado: ${(error as Error)?.name ?? "error"}`);
    })
    .finally(() => pendientes.delete(tarea));
  pendientes.add(tarea);
  // Dentro de una petición de Next, `after` mantiene vivo el trabajo hasta que termina aunque la respuesta ya se
  // haya enviado. Fuera de una petición (el worker, los tests) no existe, y basta con la promesa registrada.
  try {
    after(() => tarea);
  } catch {
    // Sin petición en curso: nada que alargar.
  }
}

/** Espera a las sombras en marcha. Para los tests y para un cierre ordenado; la puerta no la llama nunca. */
export async function esperarSombras(): Promise<void> {
  while (pendientes.size > 0) await Promise.allSettled([...pendientes]);
}

const huellaDe = (guion: string, visual: string) =>
  createHash("sha256").update(`${VERSION_PREGUNTAS_SOMBRA}\n${guion}\n${visual}`).digest("hex");

/** Evalúa en sombra y guarda la opinión. Se puede esperar (tests); la puerta usa {@link lanzarSombra}. */
export async function evaluarEnSombra(peticion: PeticionSombra): Promise<DesenlaceSombra> {
  const ajustes = await leerAjustes();
  if (!ajustes.sombraActiva || !ajustes.sombraAfirmaciones || !ajustes.sombraEncargadoAceptado) return "apagada";
  if (peticion.sujeto !== "escena" || !peticion.sujetoId) return "sin-escena";

  const texto = await textoParaLaSombra(peticion.sujetoId);
  if (typeof texto === "string") return texto;
  const { guion, visual } = texto;

  const umbral = ajustes.sombraUmbralAfirmaciones;
  const huella = huellaDe(guion, visual);
  const comun = {
    controlEvaluationId: peticion.evaluacionId,
    userId: peticion.usuarioId,
    subjectId: peticion.sujetoId,
    evaluator: "jev",
    question: PREGUNTA,
    questionsVersion: VERSION_PREGUNTAS_SOMBRA,
    threshold: umbral,
    inputHash: huella,
  };

  // El mismo texto ya se evaluó: se reutiliza la opinión y no se paga otra vez. El fotograma, el clip y la voz de
  // una escena pasan los tres por la puerta con el mismo guion.
  const [previa] = await db()
    .select()
    .from(shadowEvaluations)
    .where(
      and(
        eq(shadowEvaluations.userId, peticion.usuarioId),
        eq(shadowEvaluations.question, PREGUNTA),
        eq(shadowEvaluations.inputHash, huella),
        isNotNull(shadowEvaluations.verdict),
      ),
    )
    .orderBy(desc(shadowEvaluations.createdAt))
    .limit(1);
  if (previa && previa.fit !== null && previa.confidence !== null) {
    const veredicto = veredictoDe(previa.fit, previa.confidence, umbral);
    await db()
      .insert(shadowEvaluations)
      .values({
        ...comun,
        model: previa.model,
        verdict: veredicto,
        fit: previa.fit,
        confidence: previa.confidence,
        probabilities: previa.probabilities,
        evidence: evidenciaDeAfirmacion(1 - previa.fit, previa.confidence, veredicto),
        matchesEffective: coincideConLasReglas(veredicto, peticion.reglaAfirmaciones),
        reusedFrom: previa.reusedFrom ?? previa.id,
      });
    return "reutilizada";
  }

  const clave = await leerSecreto("typesafeApiKey");
  if (!clave) return "sin-clave";

  // La sombra corre sola en cada envío y la paga el operador: sin tope, un usuario la gastaría sin saberlo. El
  // contador sube y se compara **en la misma sentencia**, así que dos envíos a la vez no pasan los dos del tope.
  const cupo = await dentroDelLimite(`sombra:${peticion.usuarioId}`, {
    ventanaSegundos: 24 * 60 * 60,
    maximo: ajustes.sombraEvaluacionesPorDia,
  });
  if (!cupo) return "tope";

  const buscar = peticion.buscar ?? HERRAMIENTAS_JEV.buscar;
  const empezado = Date.now();
  let respuesta: RespuestaJev;
  try {
    respuesta = await decidirConJev({
      clave,
      estado: { script: guion, visual },
      pregunta: PREGUNTA_AFIRMACION,
      ...(buscar ? { buscar } : {}),
      msMaximo: peticion.msMaximo ?? MS_SOMBRA,
    });
  } catch (error) {
    if (!(error instanceof ErrorJev)) throw error;
    await db()
      .insert(shadowEvaluations)
      .values({ ...comun, error: error.codigo, latencyMs: Date.now() - empezado });
    return "fallida";
  }

  // En esta pregunta el «sí» es lo que frena, así que lo que encaja es la probabilidad del no.
  const encaja = 1 - respuesta.encaja;
  const veredicto = veredictoDe(encaja, respuesta.confianza, umbral);
  await db()
    .insert(shadowEvaluations)
    .values({
      ...comun,
      model: respuesta.modelo,
      verdict: veredicto,
      fit: encaja,
      confidence: respuesta.confianza,
      probabilities: respuesta.probabilidades,
      evidence: evidenciaDeAfirmacion(respuesta.encaja, respuesta.confianza, veredicto),
      matchesEffective: coincideConLasReglas(veredicto, peticion.reglaAfirmaciones),
      inputTokens: respuesta.tokensEntrada,
      outputTokens: respuesta.tokensSalida,
      costEur: (respuesta.tokensEntrada / 1_000_000) * ajustes.coherenciaEurosPorMillonTokens,
      latencyMs: Date.now() - empezado,
    });
  return "evaluada";
}
