import { and, eq } from "drizzle-orm";
import {
  type DeclaracionCantoVista,
  esTipoDerechosCanto,
  exigeReferenciaDeLicencia,
  NOMBRE_DERECHOS_CANTO,
  REFERENCIA_LICENCIA_MAXIMA,
  REFERENCIA_LICENCIA_MINIMA,
  TEXTO_DECLARACION_CANTO,
  type TipoDerechosCanto,
} from "@/lib/canto";
import { leerAjustes } from "../ajustes";
import { db } from "../db/cliente";
import { type FilaDeclaracionCanto, musicRightsDeclarations } from "../db/esquema";
import type { Actor } from "../media/servicio";
import { audioPropio } from "./audio";
import { ErrorCanto } from "./errores";

/**
 * **Declaración de derechos del audio con el que se canta** (RF10, 0.29.0).
 *
 * Tres decisiones del propietario (2026-09-28) que están todas aquí:
 *
 * 1. **es obligatoria**: sin ella no se genera, y lo impide el servidor, no la interfaz. La puerta la cierra el
 *    motor de controles (`canto-sin-declaracion`), que es el único sitio donde se decide si algo se puede generar;
 * 2. **tres tipos y ninguno más**: música propia, música con licencia (con su referencia) y grabación hablada
 *    propia. **No hay casilla de «uso legítimo»**: eso es una valoración jurídica que depende del país y del uso,
 *    y ponerla en un botón sería hacerla pasar por un permiso que nadie ha dado;
 * 3. **no se comprueba nada**: ningún proveedor documenta un filtro de audio con derechos, así que esto es un
 *    control y no una garantía. Lo que hace es dejar por escrito quién lo afirmó, cuándo, desde dónde y sobre qué
 *    archivo, con el **texto entero** que se le puso delante.
 *
 * Y una de alcance: la declaración vale **por audio y por usuario**, no por escena. El mismo archivo usado en seis
 * escenas se declara una vez; un audio distinto —o una subida nueva del mismo, que es otro medio— pide otra.
 */

/** IP de la petición tal como la ve esta instalación; vacía si no se puede determinar. */
async function ipDePeticion(peticion: Request): Promise<string> {
  const ajustes = await leerAjustes();
  /**
   * Las mismas cabeceras que el límite de intentos de acceso y que la declaración de veracidad del anuncio, y por
   * el mismo motivo: solo son fiables si las escribe un proxy propio que sobrescriba lo que mande el cliente.
   * Aquí la IP es un dato de la prueba y no una decisión, así que una falsificada no abre ninguna puerta: queda
   * registrada como lo que llegó.
   */
  const cabeceras = ajustes.cabecerasIp
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
  for (const cabecera of cabeceras.length > 0 ? cabeceras : ["x-forwarded-for"]) {
    const valor = peticion.headers.get(cabecera);
    // `x-forwarded-for` puede traer la cadena de proxies: la primera es la del cliente.
    const primera = valor?.split(",")[0]?.trim() ?? "";
    if (primera !== "") return primera.slice(0, 100);
  }
  return "";
}

/** Declaración vigente de ese audio para ese usuario, o `null` si no la hay. */
export async function declaracionDe(usuarioId: string, medioId: string): Promise<FilaDeclaracionCanto | null> {
  const [fila] = await db()
    .select()
    .from(musicRightsDeclarations)
    .where(and(eq(musicRightsDeclarations.userId, usuarioId), eq(musicRightsDeclarations.mediaId, medioId)))
    .limit(1);
  return fila ?? null;
}

/** `true` cuando ese audio ya está declarado por ese usuario. Es lo que lee la puerta de controles. */
export const hayDeclaracion = async (usuarioId: string, medioId: string): Promise<boolean> =>
  (await declaracionDe(usuarioId, medioId)) !== null;

/** La declaración tal como viaja al navegador. **La IP no sale**: es material de auditoría, no de pantalla. */
export const vistaDeDeclaracion = (fila: FilaDeclaracionCanto): DeclaracionCantoVista => ({
  tipo: fila.kind,
  referenciaLicencia: fila.licenseReference,
  textoAceptado: fila.acceptedText,
  aceptadoEn: fila.acceptedAt.toISOString(),
});

/** Validación pura del texto que afirma el usuario; la autorización del audio ocurre antes de llamarla. */
export function validarDatosDeclaracion(datos: { tipo: unknown; referenciaLicencia?: unknown; aceptado?: unknown }): {
  tipo: TipoDerechosCanto;
  referencia: string;
} {
  if (!esTipoDerechosCanto(datos.tipo)) {
    throw new ErrorCanto(
      400,
      "Di con qué derecho usas este audio: si la música es tuya, si la usas con licencia o si es una grabación hablada tuya.",
    );
  }
  const tipo = datos.tipo;
  if (datos.aceptado !== true) {
    throw new ErrorCanto(
      400,
      `Para usar este audio tienes que aceptar la declaración «${NOMBRE_DERECHOS_CANTO[tipo]}»: sin ella no se genera el clip.`,
    );
  }
  const referencia = typeof datos.referenciaLicencia === "string" ? datos.referenciaLicencia.trim() : "";
  if (exigeReferenciaDeLicencia(tipo)) {
    if (referencia.length < REFERENCIA_LICENCIA_MINIMA) {
      throw new ErrorCanto(
        400,
        `Con música licenciada hay que indicar la referencia de la licencia (el sello, el número o dónde la compraste), con al menos ${REFERENCIA_LICENCIA_MINIMA} caracteres. Sin ella la declaración no dice nada comprobable.`,
      );
    }
    if (referencia.length > REFERENCIA_LICENCIA_MAXIMA) {
      throw new ErrorCanto(
        400,
        `La referencia de la licencia no puede pasar de ${REFERENCIA_LICENCIA_MAXIMA} caracteres.`,
      );
    }
  }
  return { tipo, referencia: exigeReferenciaDeLicencia(tipo) ? referencia : "" };
}

/**
 * Registra la declaración de derechos de un audio propio.
 *
 * Qué exige, y nada es opcional:
 *
 * - que el **audio sea suyo** y siga estando. Un medio ajeno responde 404, igual que en el resto de la biblioteca:
 *   es lo que impide declarar derechos sobre el archivo de otra cuenta;
 * - un **tipo de los tres**; cualquier otro valor se rechaza en lugar de guardarse como texto libre;
 * - en `licenciada`, la **referencia de la licencia**. Sin ella la declaración no dice nada comprobable, y por eso
 *   es un rechazo con su motivo y no un campo vacío que se guarda igual;
 * - que `aceptado` sea expresamente `true`: una declaración no se deduce de que la petición llegara.
 *
 * Volver a declarar el mismo audio **sustituye** la declaración anterior: el usuario puede corregir el tipo o la
 * referencia, y lo que queda es la afirmación vigente con su fecha nueva. No se acumulan filas contradictorias
 * sobre el mismo archivo.
 */
export async function registrarDeclaracion(
  actor: Actor,
  datos: { medioId: unknown; tipo: unknown; referenciaLicencia?: unknown; aceptado?: unknown },
  peticion: Request,
): Promise<FilaDeclaracionCanto> {
  // De quién es el audio lo decide esta lectura, no quien llama: uno ajeno responde 404.
  const audio = await audioPropio(actor.id, datos.medioId);
  const { tipo, referencia } = validarDatosDeclaracion(datos);
  const valores = {
    userId: actor.id,
    mediaId: audio.id,
    kind: tipo,
    // Solo se guarda donde significa algo: una referencia en «música propia» sería un dato sin afirmación detrás.
    licenseReference: referencia,
    /**
     * El texto se guarda **de la versión vigente** y se lee de la fila para siempre: la redacción de mañana no
     * puede reescribir lo que alguien aceptó hoy. Es el mismo criterio que `consent_records`.
     */
    acceptedText: TEXTO_DECLARACION_CANTO[tipo],
    ip: await ipDePeticion(peticion),
  };
  const [fila] = await db()
    .insert(musicRightsDeclarations)
    .values(valores)
    .onConflictDoUpdate({
      target: [musicRightsDeclarations.userId, musicRightsDeclarations.mediaId],
      set: {
        kind: valores.kind,
        licenseReference: valores.licenseReference,
        acceptedText: valores.acceptedText,
        // La declaración vigente es la de ahora: corregir el tipo es afirmar otra cosa, y lleva su propia fecha.
        acceptedAt: new Date(),
        ip: valores.ip,
      },
    })
    .returning();
  if (!fila) throw new ErrorCanto(500, "La declaración no se ha guardado. Vuelve a intentarlo.");
  return fila;
}
