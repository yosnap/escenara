import {
  type Comprobacion,
  efectoDeComprobacion,
  type ModoCoherencia,
  type VeredictoCoherencia,
  veredictoDe,
} from "@/lib/coherencia";
import { coherenciaDe, leerAjustes } from "../ajustes";
import { leerSecreto } from "../boveda/secretos";
import type { Buscador } from "../proveedores/codigos";
import { decidirConJev, ErrorJev, mensajeDeErrorJev, type RespuestaJev } from "./jev";
import type { Percepcion } from "./percepcion";
import { evidenciaDe, PREGUNTAS, VERSION_PREGUNTAS } from "./preguntas";
import { decisionesRecientesDe, guardarDecision, type SujetoCoherencia } from "./registro";

/**
 * **Decidir y registrar**: el paso que junta los hechos percibidos con la pregunta tipada de Jev, enruta el
 * veredicto por la confianza y deja la decisión guardada con su evidencia.
 *
 * Tres invariantes de este fichero:
 *
 * 1. **una comprobación apagada no llama a nadie y no gasta nada**. Ni percibe ni pregunta: devuelve que no hay
 *    decisión y quien llama sigue como si la 0.24.0 no existiera;
 * 2. **en modo sombra el veredicto no cambia nada**. Se guarda con su evidencia y se devuelve, pero
 *    `decide` viene en `false` y quien llama tiene prohibido usarlo para bloquear. Es lo que permite medir el
 *    acierto de una comprobación antes de darle poder;
 * 3. **un fallo de Jev nunca decide**. Si la clave falta, si tarda o si contesta algo que no se entiende, no hay
 *    veredicto: se devuelve el motivo escrito para el usuario y quien llama se comporta como si la comprobación
 *    estuviera apagada. Una decisión fabricada por un error de red sería mucho peor que no decidir.
 */

/**
 * Punto de inyección de la llamada a Jev. En producción está vacío y se usa `fetch`; los tests ponen aquí su
 * simulación en lugar de sustituir el `fetch` global, que en Bun es del proceso entero y se colaría en las demás
 * suites (pasó: media y descarga de URL empezaron a fallar por eso).
 */
export const HERRAMIENTAS_JEV: { buscar?: Buscador } = {};

export interface PeticionDecision {
  usuarioId: string;
  comprobacion: Comprobacion;
  sujeto: SujetoCoherencia;
  /** Hechos percibidos. Es lo que ve Jev, que **solo lee texto**. */
  percepcion: Percepcion;
  /** Lo que se compara con esos hechos: el guion, la descripción pedida o la otra cara. */
  referencia: Record<string, string>;
  buscar?: Buscador;
  msMaximo?: number;
}

export interface ResultadoDecision {
  /** `null` cuando la comprobación está apagada o no se ha podido decidir. */
  veredicto: VeredictoCoherencia | null;
  /** `true` solo si la comprobación está **activa** y hay veredicto: es lo único que autoriza a bloquear algo. */
  decide: boolean;
  modo: ModoCoherencia;
  evidencia: string;
  confianza: number;
  umbral: number;
  /** Identificador de la decisión guardada; vacío si no se guardó ninguna. */
  decisionId: string;
  /** Motivo por el que no hay veredicto, escrito para el usuario; vacío cuando sí lo hay. */
  motivo: string;
}

const SIN_DECISION = (modo: ModoCoherencia, motivo: string): ResultadoDecision => ({
  veredicto: null,
  decide: false,
  modo,
  evidencia: "",
  confianza: 0,
  umbral: 0,
  decisionId: "",
  motivo,
});

/**
 * Pregunta a Jev sobre unos hechos ya percibidos, enruta el veredicto por la confianza y lo guarda.
 *
 * El **estado** que se le manda es un objeto con los hechos y la referencia, no una frase montada: Jev acepta
 * objetos, y mandarlo estructurado evita que el propio formato del texto sugiera una respuesta.
 */
export async function decidirCoherencia(peticion: PeticionDecision): Promise<ResultadoDecision> {
  const ajustes = await leerAjustes();
  const { modo, umbral } = coherenciaDe(ajustes, peticion.comprobacion);
  if (modo === "apagada") return SIN_DECISION(modo, "");

  const clave = await leerSecreto("typesafeApiKey");
  if (!clave) {
    return SIN_DECISION(
      modo,
      "Esta instalación no tiene guardada la clave de TypeSafe, así que la coherencia no se ha comprobado. Guárdala en Admin › Ajustes › Coherencia.",
    );
  }

  // Jev lo paga la instalación: sin tope, un usuario podría gastar su cuenta a golpe de botón.
  if ((await decisionesRecientesDe(peticion.usuarioId)) >= ajustes.coherenciaDecisionesPorDia) {
    return SIN_DECISION(
      modo,
      `Has llegado al tope de ${ajustes.coherenciaDecisionesPorDia} comprobaciones de coherencia en 24 horas que permite esta instalación. No se ha cobrado nada; vuelve a intentarlo más tarde o pide a quien la administra que suba el tope en Admin › Ajustes › Coherencia.`,
    );
  }

  const definicion = PREGUNTAS[peticion.comprobacion];
  const buscar = peticion.buscar ?? HERRAMIENTAS_JEV.buscar;
  const empezado = Date.now();
  let respuesta: RespuestaJev;
  try {
    respuesta = await decidirConJev({
      clave,
      estado: { perceived: peticion.percepcion.hechos, ...peticion.referencia },
      pregunta: definicion.pregunta,
      encajan: definicion.encajan,
      ...(buscar ? { buscar } : {}),
      ...(peticion.msMaximo === undefined ? {} : { msMaximo: peticion.msMaximo }),
    });
  } catch (error) {
    if (error instanceof ErrorJev) {
      // Se dice qué ha pasado y no se decide. En modo activo, quien llama deja lo que había sin tocar.
      return SIN_DECISION(modo, `No se ha podido comprobar la coherencia: ${mensajeDeErrorJev(error)}`);
    }
    throw error;
  }
  const latencia = Date.now() - empezado;
  const veredicto = veredictoDe(respuesta.encaja, respuesta.confianza, umbral);
  const evidencia = evidenciaDe(peticion.comprobacion, respuesta, peticion.percepcion.hechos);
  const euros = (respuesta.tokensEntrada / 1_000_000) * ajustes.coherenciaEurosPorMillonTokens;

  const decisionId = await guardarDecision({
    usuarioId: peticion.usuarioId,
    comprobacion: peticion.comprobacion,
    modo,
    sujeto: peticion.sujeto,
    veredicto,
    confianza: respuesta.confianza,
    umbral,
    encaja: respuesta.encaja,
    probabilidades: respuesta.probabilidades,
    hechos: peticion.percepcion.hechos,
    evidencia,
    modeloDecision: respuesta.modelo,
    proveedorPercepcion: peticion.percepcion.proveedor,
    modeloPercepcion: peticion.percepcion.modelo,
    reglasVersion: VERSION_PREGUNTAS,
    tokensEntrada: respuesta.tokensEntrada,
    tokensSalida: respuesta.tokensSalida,
    euros,
    latenciaMs: latencia,
  });

  return {
    veredicto,
    // Solo decide la comprobación que tiene poder (hoy, el parecido) y está en Activa. Las demás, aunque estén en
    // Activa, y todas en sombra, dejan el veredicto escrito y no mueven nada.
    decide: efectoDeComprobacion(peticion.comprobacion, modo) === "decide",
    modo,
    evidencia,
    confianza: respuesta.confianza,
    umbral,
    decisionId,
    motivo: "",
  };
}
