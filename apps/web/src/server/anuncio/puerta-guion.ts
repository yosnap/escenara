import { eq } from "drizzle-orm";
import { AVISO_DECLARACION_NECESARIA } from "@/lib/anuncio";
import { db } from "../db/cliente";
import { adBriefs, offers } from "../db/esquema-anuncio";
import { buscarAngulo } from "./catalogo";
import { hayDeclaracion } from "./declaracion";
import { ErrorAnuncio } from "./errores";

/**
 * **La puerta del guion del anuncio**: dice si un proyecto con brief puede pedirle hooks y guion al asistente.
 *
 * Lo que exige es deliberadamente poco —**producto, ángulo y «qué se da»**—, porque un brief largo que nadie
 * rellena no protege de nada (riesgo de la fase). Lo demás (el público, la versión mejor de sí mismo, las notas)
 * mejora la propuesta y no bloquea.
 *
 * Y lo que **sí** bloquea de verdad: un ángulo que afirma algo comprobable sin la declaración de veracidad
 * registrada para **ese** ángulo. Ahí no hay confirmación que valga, porque lo que está en juego no es dinero,
 * es lo que se publica afirmando.
 *
 * ## Por qué no vive en el motor de controles (0.18.0)
 *
 * El motor evalúa **un trabajo de la cola** (`Hechos.tipo` es un `TipoTrabajoCola`) y su puerta exige tener
 * resueltos los seis grupos de hechos —credencial, modelo, personaje, presupuesto, cuota y escena— antes de dejar
 * pasar, porque un grupo que falta no se evalúa. Pedir un guion no es un trabajo de la cola: no hay modelo de
 * imagen elegido, no hay escena aprobada y no hay cuota de biblioteca que reservar, así que habría que inventar
 * hechos vacíos para poder preguntar, y un hecho inventado en ese motor es un pase gratis silencioso.
 *
 * Por eso esto es una función aparte, con la misma forma de responder: **por qué** no se puede y **qué** hacer.
 * Quien pide el guion la llama antes de gastar un solo token.
 */

/** Lo que falta para poder pedir guion, ya redactado. Vacío = se puede. */
export interface PuertaDelGuion {
  puede: boolean;
  /** Por qué no, en lenguaje llano y nombrando lo que falta. Vacío cuando se puede. */
  motivo: string;
  /** `true` cuando lo que falta es la declaración de veracidad del ángulo elegido. */
  faltaDeclaracion: boolean;
}

const PUEDE: PuertaDelGuion = { puede: true, motivo: "", faltaDeclaracion: false };

/**
 * Comprueba si el proyecto puede pedir guion. **No autoriza a nadie**: el dueño del proyecto lo comprueba quien
 * llama (`asistente/consulta.ts › proyectoPropio`), porque esta función también sirve para pintar el estado de la
 * pantalla del brief.
 *
 * Un proyecto **sin brief** puede pedir guion igual: el brief es opcional y el asistente de 0.17.0 sigue
 * funcionando como siempre con la idea y el concepto. Lo que esta puerta comprueba es que un brief **a medias** no
 * se convierta en una petición de pago que iba a salir mal.
 */
export async function puedePedirGuion(proyectoId: string): Promise<PuertaDelGuion> {
  const [brief] = await db().select().from(adBriefs).where(eq(adBriefs.projectId, proyectoId)).limit(1);
  // Sin brief no hay nada que exigir: es el camino de antes de esta versión.
  if (!brief) return PUEDE;

  const faltan: string[] = [];
  if (!brief.productId) faltan.push("de qué producto es el anuncio");
  if (brief.anglePresetKey === "") faltan.push("el ángulo");

  const [oferta] = brief.offerId ? await db().select().from(offers).where(eq(offers.id, brief.offerId)).limit(1) : [];
  const queSeDa = oferta && oferta.deletedAt === null ? oferta.whatTheyGet.trim() : "";
  if (queSeDa === "") faltan.push("una oferta con qué se le da");

  if (faltan.length > 0) {
    return {
      puede: false,
      motivo: `Al brief de este anuncio le falta ${faltan.join(", ")}. Complétalo y vuelve a pedir el guion: sin ángulo y sin oferta el guion sale de la nada, que es justo lo que esta versión evita.`,
      faltaDeclaracion: false,
    };
  }

  const angulo = await buscarAngulo(brief.anglePresetKey);
  /**
   * El ángulo guardado ya no está en el catálogo (quien administra lo ha borrado). No se deja pedir guion con él:
   * Jev no tendría con qué comparar el resultado, y el mensaje dice exactamente qué ha pasado.
   */
  if (!angulo) {
    return {
      puede: false,
      motivo:
        "El ángulo que tenía este brief ya no está en el catálogo de esta instalación, así que no hay con qué comparar el guion. Elige otro ángulo en el brief.",
      faltaDeclaracion: false,
    };
  }
  if (angulo.exigeDeclaracion && !(await hayDeclaracion(proyectoId, angulo.clave))) {
    return {
      puede: false,
      motivo: `${AVISO_DECLARACION_NECESARIA} Falta la declaración del ángulo «${angulo.nombre}»: acéptala en el brief y vuelve a pedir el guion.`,
      faltaDeclaracion: true,
    };
  }
  return PUEDE;
}

/**
 * Igual, pero lanzando el error con su código: es lo que llama quien va a **gastar** (el asistente de hooks y
 * guion del bloque siguiente), para que la petición no salga si el brief no está listo.
 *
 * 409 y no 400: lo que llega está bien formado, es el estado del brief lo que no permite seguir todavía.
 */
export async function exigirPuedePedirGuion(proyectoId: string): Promise<void> {
  const puerta = await puedePedirGuion(proyectoId);
  if (!puerta.puede) throw new ErrorAnuncio(409, puerta.motivo);
}

/**
 * Lo único que la ruta del asistente de siempre tiene que respetar del brief: **la declaración de veracidad**.
 *
 * Esa ruta no exige producto, ángulo ni oferta —escribir el guion a mano o con la idea sigue siendo válido—, pero
 * si el proyecto ya tiene un ángulo que afirma algo comprobable, el guion no se escribe sin que esté declarado, lo
 * pida quien lo pida. Devuelve el motivo, o una cadena vacía si puede seguir.
 */
export async function motivoSinDeclaracion(proyectoId: string): Promise<string> {
  const [brief] = await db().select().from(adBriefs).where(eq(adBriefs.projectId, proyectoId)).limit(1);
  if (!brief || brief.anglePresetKey === "") return "";
  const angulo = await buscarAngulo(brief.anglePresetKey);
  if (!angulo?.exigeDeclaracion || (await hayDeclaracion(proyectoId, angulo.clave))) return "";
  return `${AVISO_DECLARACION_NECESARIA} Falta la declaración del ángulo «${angulo.nombre}»: acéptala en el brief y vuelve a pedir el guion.`;
}
