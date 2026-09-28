import { and, eq } from "drizzle-orm";
import type { Medio } from "@/lib/media/tipos";
import { firmaDeVoz, type ParametrosVoz, VOCES_OFRECIDAS } from "@/lib/voz";
import { ErrorProyecto } from "../asistente/errores";
import { encolar, filaDeLaConfirmacion } from "../cola/encolar";
import { recopilarHechos } from "../controles/hechos";
import { exigirControles } from "../controles/puerta";
import { db } from "../db/cliente";
import { type FilaTrabajo, generationJobs, media, voiceSamples } from "../db/esquema";
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
import { type Actor, aDto } from "../media/servicio";
import { acotarCoste } from "../presupuesto/acotar";
import type { ConfirmacionVoz } from "./tts";
import { eleccionDeVoz, exigirTtsEncendido } from "./tts";

/**
 * Muestra de una voz (RF08, 0.21.0): **una por voz y por parámetros, cacheada**, con su coste mostrado antes de
 * pedirla.
 *
 * La caché no es una optimización, es una decisión de dinero: sin ella, comparar seis voces costaría seis llamadas
 * **cada vez** que alguien vuelve a abrir el selector. Con ella, la pantalla puede decir «esta ya la has oído y no
 * cuesta nada» o «oírla cuesta N créditos», que es lo que hace falta para elegir con conocimiento.
 *
 * El gasto recorre el mismo camino que todo lo demás: se encola un trabajo de `voz` con su reserva, su
 * idempotencia y su cierre. La única diferencia con la voz de una escena es que **no pertenece a ninguna**, así que
 * su resultado no se escribe en ninguna escena, sino en esta caché.
 */

/**
 * Lo que dice la muestra. Es una frase corta y fija: lo que se está juzgando es el timbre, y una frase larga solo
 * alargaría la llamada y su coste. Se escribe en español porque es el idioma en el que se dicen los diálogos.
 */
export const TEXTO_DE_MUESTRA = "Hola, así suena mi voz. Con ella se leerán los diálogos de tu proyecto.";

/** Clave de caché de una muestra: la voz más sus parámetros, firmados con el texto de la muestra. */
const firmaDeMuestra = (
  proveedor: ReturnType<typeof proveedorDeCredencial>,
  modelo: string,
  voz: string,
  parametros: ParametrosVoz,
) => firmaDeVoz("pista", { proveedor, modelo, voz, parametros, fijadaEn: "" }, TEXTO_DE_MUESTRA);

/**
 * Una muestra en marcha **es una muestra ya pagada aunque todavía no esté en la caché**: la caché solo se rellena
 * al cerrar el trabajo, así que entre el clic y el cierre no hay nada que impida volver a pedir la misma.
 *
 * Sin esta guardia, perder la respuesta del primer clic (una recarga, el móvil que pierde cobertura, dos pestañas
 * abiertas) cobraba dos veces el mismo audio: la clave de idempotencia es nueva en cada clic, así que no cortaba.
 * Se compara por la **firma** de la muestra, que es la voz más sus parámetros: otra voz u otros mandos son otra
 * muestra y sí se pueden pedir a la vez.
 *
 * La comprobación va **fuera** de la transacción de `encolar`, así que dos peticiones exactamente simultáneas
 * (doble clic de milisegundos, dos pestañas enviando a la vez) podrían pasar las dos. Queda así a sabiendas: el
 * caso que cuesta dinero de verdad —perder la respuesta y reintentar minutos después— sí queda cerrado, y meter
 * esto dentro de `encolar` significaría añadirle un caso propio de la voz a la transacción que comparten todos los
 * tipos de trabajo. Si alguna vez importa, el sitio es junto a `exigirEscenaSinRepetir`.
 */
async function exigirMuestraSinRepetir(usuarioId: string, firma: string): Promise<void> {
  const enCurso = await db()
    .select({ input: generationJobs.input })
    .from(generationJobs)
    .where(and(eq(generationJobs.userId, usuarioId), eq(generationJobs.kind, "voz"), condicionEnCurso()));
  const repetida = enCurso.some(
    ({ input }) => (input as { muestraDeVoz?: { firma?: unknown } }).muestraDeVoz?.firma === firma,
  );
  if (repetida) {
    throw new ErrorProyecto(
      409,
      "Esa muestra ya se está generando. Espera a que termine antes de volver a pedirla: si no, se pagarían las dos.",
    );
  }
}

/** Muestras que este usuario ya tiene pagadas, por voz. Es lo que la pantalla usa para no volver a cobrarlas. */
export async function muestrasDe(actor: Actor, modelo: string, parametros: ParametrosVoz): Promise<Map<string, Medio>> {
  const filas = await db()
    .select({ muestra: voiceSamples, medio: media })
    .from(voiceSamples)
    .innerJoin(media, eq(voiceSamples.mediaId, media.id))
    .where(and(eq(voiceSamples.userId, actor.id), eq(voiceSamples.model, modelo)));
  const mapa = new Map<string, Medio>();
  for (const { muestra, medio } of filas) {
    if (medio.deletedAt !== null) continue;
    // Solo cuenta la muestra de **estos** parámetros: la misma voz con otra estabilidad suena distinto.
    if (muestra.paramsSignature !== firmaDeMuestra(muestra.provider, modelo, muestra.voice, parametros)) continue;
    mapa.set(muestra.voice, aDto(medio, actor));
  }
  return mapa;
}

/**
 * Pide la muestra de una voz. Si ya está pagada, **no llama a nadie y no cobra**: devuelve la que hay.
 *
 * `confirmacion` es obligatoria igual que en cualquier otro gasto: los créditos que el usuario tenía delante, el
 * sello del precio que se le mostró y la clave que firma su clic.
 */
export async function pedirMuestra(
  actor: Actor,
  voz: string,
  parametros: ParametrosVoz,
  confirmacion: ConfirmacionVoz,
  h: Herramientas = HERRAMIENTAS,
): Promise<{ trabajo: FilaTrabajo | null; medio: Medio | null }> {
  if (!VOCES_OFRECIDAS.some((v) => v.id === voz)) {
    throw new ErrorProyecto(400, "Esa voz no está entre las que ofrece esta instalación.");
  }
  // El interruptor del panel primero: una instalación con la voz apagada no llega a estimar nada, y mucho menos a
  // encolar. La interfaz esconde el botón, pero la ruta es pública para cualquier usuario con sesión.
  await exigirTtsEncendido();
  const claveIdempotencia = exigirClaveIdempotencia(confirmacion.claveIdempotencia);
  const opciones = await eleccionDeVoz(actor.id);
  const { modelo, adaptador, precio } = opciones.elegida;
  const proveedor = proveedorDeCredencial(modelo);
  // La muestra ya pagada se devuelve **antes** de mirar el coste: no hay nada que confirmar si no se va a gastar.
  const yaPagada = (await muestrasDe(actor, modelo.modelo, parametros)).get(voz);
  if (yaPagada) return { trabajo: null, medio: yaPagada };

  // El mayor de los dos proveedores, igual que en la voz de una escena: cubre el cambio automático.
  const creditos = opciones.creditos;
  exigirSelloVigente(confirmacion.selloEstimacion, precio.sello, true);
  exigirConfirmacion(confirmacion.creditosConfirmados, creditos);
  await exigirAvisoUmbral(creditos, confirmacion.avisoUmbralAceptado);
  const yaHecho = await filaDeLaConfirmacion(actor.id, claveIdempotencia);
  if (yaHecho) return { trabajo: yaHecho, medio: null };
  await exigirRitmo(actor.id);
  const firma = firmaDeMuestra(proveedor, modelo.modelo, voz, parametros);
  await exigirMuestraSinRepetir(actor.id, firma);

  /**
   * Misma puerta que cualquier otro gasto (ADR-0023). Una muestra **no pertenece a ningún proyecto**, así que no
   * lleva techo de proyecto ni escena: lo que se evalúa es la credencial, el precio, la cuota y el dinero del
   * usuario.
   */
  await exigirControles(
    { usuarioId: actor.id, sujeto: "trabajo", sujetoId: null, tipo: "voz" },
    await recopilarHechos(
      actor,
      {
        tipo: "voz",
        eleccion: { modelo, adaptador, precio },
        creditos,
        personajeId: null,
        personaje: null,
        escena: null,
        proyecto: null,
      },
      h.buscar,
    ),
    confirmacion.avisosConfirmados ?? [],
  );

  const { fila } = await encolar({
    usuarioId: actor.id,
    claveIdempotencia,
    proveedor,
    acotacion: acotarCoste("voz", { modelo, adaptador, precio }),
    valores: {
      userId: actor.id,
      kind: "voz",
      provider: proveedor,
      model: modelo.modelo,
      prompt: TEXTO_DE_MUESTRA,
      input: {
        dialogo: TEXTO_DE_MUESTRA,
        voz: { voz, parametros },
        // Marca que este trabajo es una muestra: es lo que hace que su resultado entre en la caché y no en una
        // escena. Sin ella, el audio se guardaría en la biblioteca y nadie sabría de qué voz era.
        muestraDeVoz: { voz, firma },
      },
      // Una muestra **no es de ninguna escena**: no toca ningún proyecto y no cuenta como escena en vuelo.
      sceneId: null,
      estimatedCredits: creditos,
    },
    sello: precio.sello,
    creditosDelEnvio: creditos,
    escena: null,
  });
  return { trabajo: fila, medio: null };
}

/**
 * Guarda en la caché el audio de una muestra que acaba de terminar. Se llama desde el cierre del trabajo, que es el
 * único sitio que sabe de verdad qué ha pasado con el dinero.
 *
 * Es idempotente por la clave única: cerrar dos veces el mismo trabajo no crea dos muestras. Un trabajo que no sea
 * una muestra no hace nada aquí.
 */
export async function adjuntarMuestraDeVoz(fila: FilaTrabajo, medioId: string): Promise<void> {
  const marca = (fila.input as { muestraDeVoz?: unknown }).muestraDeVoz;
  if (!marca || typeof marca !== "object") return;
  const { voz, firma } = marca as { voz?: unknown; firma?: unknown };
  if (typeof voz !== "string" || typeof firma !== "string" || voz === "" || firma === "") return;
  await db()
    .insert(voiceSamples)
    .values({
      userId: fila.userId,
      provider: fila.provider,
      model: fila.model,
      voice: voz,
      paramsSignature: firma,
      mediaId: medioId,
    })
    .onConflictDoNothing();
}
