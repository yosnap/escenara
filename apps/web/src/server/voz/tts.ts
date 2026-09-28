import { and, eq } from "drizzle-orm";
import { DIALOGO_VOZ_MAXIMO, firmaDeVoz, type VozDelProyecto } from "@/lib/voz";
import { leerAjustes } from "../ajustes";
import { escenaPropia } from "../asistente/consulta";
import { ErrorProyecto } from "../asistente/errores";
import { techoDelProyecto } from "../asistente/plan";
import { encolar, filaDeLaConfirmacion } from "../cola/encolar";
import { recopilarHechos } from "../controles/hechos";
import { exigirControles } from "../controles/puerta";
import { db } from "../db/cliente";
import { type FilaEscena, type FilaProyecto, type FilaTrabajo, generationJobs } from "../db/esquema";
import {
  exigirAvisoUmbral,
  exigirClaveIdempotencia,
  exigirConfirmacion,
  exigirRitmo,
  proveedorDeCredencial,
} from "../generacion/comprobaciones";
import { HERRAMIENTAS, type Herramientas } from "../generacion/herramientas";
import { exigirSelloVigente } from "../generacion/precios";
import { condicionEnCurso } from "../generacion/trabajos";
import { aReservaAutorizada } from "../mapa/voz";
import type { Actor } from "../media/servicio";
import { acotarCoste } from "../presupuesto/acotar";
import { type EleccionDeVoz, eleccionDeVozDe } from "./eleccion";
import { vozDelProyecto } from "./proyecto";

/**
 * Pista de voz de una escena (RF08, 0.21.0). **Cuesta dinero**, así que no tiene ningún camino propio: encola un
 * trabajo en `generation_jobs` con `kind = "voz"` y hereda, sin repetir una sola regla, la reserva atómica con la
 * fila del usuario bloqueada, la idempotencia por confirmación, el tope de trabajos simultáneos y de escenas en
 * vuelo, el cierre del gasto con lo que informe el proveedor y la regla de que **tras un fallo sin respuesta no se
 * reenvía nada**.
 *
 * Lo que sí se decide aquí, y solo aquí:
 *
 * - la voz es **la del proyecto**: no llega ninguna voz en la petición, y por eso no hay forma de cambiarla por
 *   escena;
 * - solo se genera en modo `pista`: en modo `clip` la voz va dentro del clip y pedir una pista aparte sería pagar
 *   dos veces por lo mismo;
 * - la firma de la voz se guarda con el trabajo, así que cuando el audio llega se puede decir si sigue
 *   correspondiendo a lo que el proyecto pide hoy.
 */

/** Lo que el navegador confirma para generar la voz de una escena. Sin esto no se llama a nadie. */
export interface ConfirmacionVoz {
  creditosConfirmados: number;
  selloEstimacion: string;
  claveIdempotencia: string;
  avisoUmbralAceptado?: boolean;
  /** Avisos del motor de controles que el usuario ha confirmado expresamente, por su clave. */
  avisosConfirmados?: readonly string[];
}

export interface VozEncolada {
  trabajo: FilaTrabajo;
  /** `false` cuando esta confirmación ya estaba encolada: no se ha creado nada nuevo y no se ha cobrado otra vez. */
  nueva: boolean;
}

/**
 * Modelo de voz y precio con los que se trabajaría **para este usuario**, con su proveedor de reserva si lo hay.
 * Sin modelo con precio o sin credencial de su proveedor, esto lanza con el motivo y no se estima nada.
 */
export function eleccionDeVoz(
  usuarioId: string,
  dialogo = "",
  modelo?: string | null,
  vozFijada?: string | null,
): Promise<EleccionDeVoz> {
  return eleccionDeVozDe(usuarioId, dialogo, modelo, vozFijada);
}

/**
 * El interruptor del panel es **una puerta, no un adorno de interfaz**: si quien administra apaga la voz, ningún
 * camino de gasto de voz puede seguir. Vive aquí, en un solo sitio, porque lo usan la pista de una escena y la
 * muestra de una voz, y dos copias de la misma comprobación se desincronizan.
 */
export async function exigirTtsEncendido(): Promise<void> {
  const { vozTtsActivo } = await leerAjustes();
  if (!vozTtsActivo) {
    throw new ErrorProyecto(
      503,
      "Esta instalación no ofrece la pista de voz aparte. Quien administra puede encenderla en Admin › Ajustes › Voz y subtítulos.",
    );
  }
}

/**
 * Comprueba que esta instalación **y** este proyecto pueden generar voz. Se llama antes de mirar el dinero: un
 * proyecto en modo `clip` o una instalación con la voz apagada no tienen que llegar a estimar nada.
 */
export async function exigirVozDisponible(proyecto: FilaProyecto): Promise<VozDelProyecto> {
  await exigirTtsEncendido();
  if (proyecto.voiceMode !== "pista") {
    throw new ErrorProyecto(
      409,
      "Este proyecto usa la voz del propio clip, así que no hay ninguna pista de voz que generar. Los subtítulos salen de transcribir el audio del clip.",
    );
  }
  const voz = vozDelProyecto(proyecto);
  if (!voz) {
    throw new ErrorProyecto(409, "Elige la voz del proyecto antes de generar el audio de sus escenas.");
  }
  return voz;
}

/** El diálogo que se va a leer. Sin diálogo no hay nada que decir, y una llamada vacía costaría igual. */
function dialogoDeLaEscena(escena: FilaEscena): string {
  const dialogo = escena.scriptText.trim().replace(/\s+/g, " ");
  if (dialogo === "") {
    throw new ErrorProyecto(
      409,
      `La escena ${escena.sortOrder} no tiene diálogo, así que no hay nada que leer. Escribe lo que dice antes de generar su voz.`,
    );
  }
  return dialogo.slice(0, DIALOGO_VOZ_MAXIMO);
}

/**
 * Una sola pista de voz por escena a la vez, y ninguna si ya tiene la suya **vigente**.
 *
 * Va aquí y no dentro de la transacción del encolado porque la de `cola/encolar.ts` ya impide dos trabajos del
 * mismo `kind` en marcha para la misma escena (que es lo que evitaría el doble cobro); esto es la respuesta
 * temprana y con motivo, para no hacerle llegar al usuario un 409 genérico.
 */
async function exigirEscenaSinVoz(proyecto: FilaProyecto, escena: FilaEscena): Promise<void> {
  const [enCurso] = await db()
    .select({ id: generationJobs.id })
    .from(generationJobs)
    .where(and(eq(generationJobs.sceneId, escena.id), eq(generationJobs.kind, "voz"), condicionEnCurso()))
    .limit(1);
  if (enCurso) {
    throw new ErrorProyecto(
      409,
      "Esta escena ya tiene su voz en marcha. Espera a que termine antes de pedir otra: si no, se pagarían las dos.",
    );
  }
  const vigente = firmaDeVoz("pista", vozDelProyecto(proyecto), escena.scriptText);
  if (escena.voiceMediaId !== null && escena.voiceSignature === vigente) {
    throw new ErrorProyecto(
      409,
      "Esta escena ya tiene su voz generada con la voz y el diálogo de ahora. Volver a generarla sería pagar dos veces lo mismo.",
    );
  }
}

/**
 * Encola la voz de una escena. Todo el dinero lo deciden `encolar` y el registro de gasto; aquí solo se comprueba
 * **qué** se va a decir, **con qué voz** y que el usuario ha confirmado el coste que tenía delante.
 */
export async function generarVozDeEscena(
  actor: Actor,
  escenaId: string,
  confirmacion: ConfirmacionVoz,
  modeloPedido?: string | null,
  h: Herramientas = HERRAMIENTAS,
): Promise<VozEncolada> {
  const claveIdempotencia = exigirClaveIdempotencia(confirmacion.claveIdempotencia);
  const { escena, proyecto } = await escenaPropia(actor, escenaId);
  const voz = await exigirVozDisponible(proyecto);
  const dialogo = dialogoDeLaEscena(escena);

  /**
   * El precio se calcula **con el diálogo de esta escena**, no con una tarifa plana: los modelos de voz cobran por
   * carácter, así que un monólogo cuesta decenas de veces lo que una frase. Es lo que hace que el coste esté
   * acotado de verdad y que la reserva cubra lo que se va a gastar.
   */
  // La voz del proyecto acota las opciones: una de otra familia no puede leerla y cambiaría el timbre.
  const opciones = await eleccionDeVoz(actor.id, dialogo, modeloPedido, voz.voz);
  const eleccion = opciones.elegida;
  const { modelo, precio } = eleccion;
  // En la moneda del proveedor por el que se va a gastar. Los créditos de dos proveedores no se comparan.
  const creditos = opciones.creditos;
  exigirSelloVigente(confirmacion.selloEstimacion, precio.sello, true);
  exigirConfirmacion(confirmacion.creditosConfirmados, creditos);
  await exigirAvisoUmbral(creditos, confirmacion.avisoUmbralAceptado);

  // Corte de idempotencia **antes** de comprobar nada más: repetir la misma confirmación devuelve el trabajo que
  // ya existe y no reserva, no encola y no llama al proveedor otra vez.
  const yaHecho = await filaDeLaConfirmacion(actor.id, claveIdempotencia);
  if (yaHecho) return { trabajo: yaHecho, nueva: false };
  await exigirRitmo(actor.id);
  await exigirEscenaSinVoz(proyecto, escena);

  // ── Punto único: el motor decide si esto se puede generar ───────────────────────────────────────────
  /**
   * La voz pasa por **la misma puerta** que cualquier otro gasto (ADR-0023): credencial utilizable, precio
   * vigente, cuota de la biblioteca y los tres techos del dinero. Lo que no lleva es personaje ni escena del
   * plan: una pista de voz no genera ninguna cara y no produce la escena, así que sus reglas de consentimiento
   * y de plan aprobado no aplican y sus grupos de hechos van vacíos.
   */
  await exigirControles(
    { usuarioId: actor.id, sujeto: "escena", sujetoId: escena.id, tipo: "voz" },
    await recopilarHechos(
      actor,
      {
        tipo: "voz",
        eleccion,
        creditos,
        personajeId: null,
        personaje: null,
        escena: null,
        proyecto: await techoDelProyecto(proyecto.id),
      },
      h.buscar,
    ),
    confirmacion.avisosConfirmados ?? [],
  );

  // A partir de aquí ya no queda ninguna regla: el motor las ha aplicado todas.
  const proveedor = proveedorDeCredencial(modelo);
  /**
   * La voz fijada en el proyecto guarda con qué proveedor se eligió. Que ahora se envíe a otro **no es un
   * problema**: las voces son las mismas (los identificadores de ElevenLabs), y el cambio automático existe
   * precisamente para que una avería de un proveedor no deje el proyecto parado. Lo que sí se hace es dejarlo
   * escrito en el trabajo, para que después se pueda decir en qué cuenta se gastó.
   */
  const firma = firmaDeVoz("pista", voz, escena.scriptText);
  const { fila, nueva } = await encolar({
    usuarioId: actor.id,
    claveIdempotencia,
    proveedor,
    acotacion: acotarCoste("voz", eleccion),
    valores: {
      userId: actor.id,
      kind: "voz",
      provider: proveedor,
      model: modelo.modelo,
      // El «prompt» de una voz es el texto que se va a leer: es lo que el trabajo tiene que poder auditar.
      prompt: dialogo,
      /**
       * La voz y sus parámetros se guardan **dentro del trabajo**, no se vuelven a leer del proyecto al despachar:
       * si el usuario cambiara la voz entre encolar y enviar, lo que se paga tiene que seguir siendo lo que
       * confirmó. `firmaVoz` es lo que permite decir después si ese audio sigue valiendo.
       */
      /**
       * `reservas` son los topes que el usuario vio para cada reserva de su mapa, **cada uno en la moneda de su
       * proveedor**: el relevo automático solo puede ir a esos proveedores y modelos, y solo si lo que cuesta
       * cabe en el suyo (`despacho.ts`). Quedan congelados aquí: si el usuario cambia su mapa entre encolar y
       * enviar, lo que se paga sigue siendo lo que confirmó.
       *
       * `urlBase` viaja con ellos porque un servicio compatible con la API de OpenAI lo elige cada usuario y el
       * adaptador no puede saber a qué dirección llamar.
       */
      input: {
        dialogo,
        voz: { voz: voz.voz, parametros: voz.parametros },
        firmaVoz: firma,
        urlBase: opciones.urlBase,
        compatibleId: opciones.compatibleId,
        // Solo la primera reserva, que es la única cuyo coste enseña la pantalla: autorizar las demás sería cambiar
        // de proveedor a un importe que el usuario no ha visto.
        reservas: opciones.reservas.slice(0, 1).map(aReservaAutorizada),
      },
      sceneId: escena.id,
      estimatedCredits: creditos,
    },
    sello: precio.sello,
    creditosDelEnvio: creditos,
    // La voz cuenta como escena en vuelo, igual que el fotograma y el clip: es otro gasto comprometido de la misma
    // escena. **Nunca es un reintento de pago**: esto solo se pide a mano y jamás tras un fallo con coste.
    escena: { escenaId: escena.id, maximo: (await leerAjustes()).escenasEnVuelo, reintento: false },
  });
  return { trabajo: fila, nueva };
}
