import { and, eq } from "drizzle-orm";
import type { Medio } from "@/lib/media/tipos";
import { firmaDeVoz, type ParametrosVoz, VOCES_OFRECIDAS } from "@/lib/voz";
import { ErrorProyecto } from "../asistente/errores";
import { encolar, filaDeLaConfirmacion } from "../cola/encolar";
import { db } from "../db/cliente";
import { type FilaTrabajo, media, voiceSamples } from "../db/esquema";
import {
  exigirAvisoUmbral,
  exigirClaveIdempotencia,
  exigirConfirmacion,
  exigirRitmo,
  proveedorDeCredencial,
} from "../generacion/comprobaciones";
import { exigirSelloVigente } from "../generacion/precios";
import { type Actor, aDto } from "../media/servicio";
import { acotarCoste } from "../presupuesto/acotar";
import type { ConfirmacionVoz } from "./tts";
import { eleccionDeVoz } from "./tts";

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
): Promise<{ trabajo: FilaTrabajo | null; medio: Medio | null }> {
  if (!VOCES_OFRECIDAS.some((v) => v.id === voz)) {
    throw new ErrorProyecto(400, "Esa voz no está entre las que ofrece esta instalación.");
  }
  const claveIdempotencia = exigirClaveIdempotencia(confirmacion.claveIdempotencia);
  const { modelo, adaptador, precio } = await eleccionDeVoz();
  const proveedor = proveedorDeCredencial(modelo);
  // La muestra ya pagada se devuelve **antes** de mirar el coste: no hay nada que confirmar si no se va a gastar.
  const yaPagada = (await muestrasDe(actor, modelo.modelo, parametros)).get(voz);
  if (yaPagada) return { trabajo: null, medio: yaPagada };

  const creditos = Math.ceil(precio.creditos);
  exigirSelloVigente(confirmacion.selloEstimacion, precio.sello, true);
  exigirConfirmacion(confirmacion.creditosConfirmados, creditos);
  await exigirAvisoUmbral(creditos, confirmacion.avisoUmbralAceptado);
  const yaHecho = await filaDeLaConfirmacion(actor.id, claveIdempotencia);
  if (yaHecho) return { trabajo: yaHecho, medio: null };
  await exigirRitmo(actor.id);

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
        muestraDeVoz: { voz, firma: firmaDeMuestra(proveedor, modelo.modelo, voz, parametros) },
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
