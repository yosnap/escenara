import { and, desc, eq } from "drizzle-orm";
import { TEXTO_DECLARACION_VERACIDAD } from "@/lib/anuncio";
import { leerAjustes } from "../ajustes";
import { proyectoPropio } from "../asistente/consulta";
import { db } from "../db/cliente";
import { type FilaDeclaracionAfirmacion, sensitiveClaimDeclarations } from "../db/esquema-anuncio";
import type { Actor } from "../media/servicio";
import { buscarAngulo } from "./catalogo";
import { ErrorAnuncio } from "./errores";

/**
 * **Declaración de veracidad** de los ángulos que afirman algo comprobable (mecanismo, beneficio, miedo/pérdida y
 * comparación de fábrica; lo decide cada preset con `valores.exigeDeclaracion`).
 *
 * Mismo patrón que `consent_records`: se guarda el **texto aceptado entero**, con su fecha, su IP y la cuenta que
 * lo aceptó. Lo que hay que poder demostrar es qué se le puso delante, no que pulsó una casilla, y si una versión
 * futura cambia la redacción, lo ya aceptado conserva la suya.
 *
 * Va por proyecto **y ángulo**: cambiar de ángulo es afirmar otra cosa, así que la declaración del anterior no
 * sirve para el nuevo. Aceptar dos veces el mismo no crea una segunda fila ni es un error: la que hay ya es la
 * prueba.
 *
 * Esto es un **control, no una garantía**, igual que la mayoría de edad del consentimiento: nadie comprueba que
 * lo declarado sea cierto. Lo que hace es dejar por escrito quién lo afirmó, cuándo y sobre qué ángulo. La
 * revisión legal de 0.46.0 es la que decidirá si hace falta algo más.
 */

/** IP de la petición tal como la ve esta instalación; vacía si no se puede determinar. */
async function ipDePeticion(peticion: Request): Promise<string> {
  const ajustes = await leerAjustes();
  /**
   * Las mismas cabeceras que el límite de intentos de acceso (`auth/auth.ts`), y por el mismo motivo: solo son
   * fiables si las escribe un proxy propio que sobrescriba lo que mande el cliente. Aquí la IP es un dato de la
   * prueba, no una decisión, así que una falsificada no abre ninguna puerta: queda registrada como lo que llegó.
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

/** `true` cuando ese proyecto ya tiene declaración registrada **para ese ángulo**. */
export async function hayDeclaracion(proyectoId: string, angulo: string): Promise<boolean> {
  if (angulo === "") return false;
  const [fila] = await db()
    .select({ id: sensitiveClaimDeclarations.id })
    .from(sensitiveClaimDeclarations)
    .where(
      and(eq(sensitiveClaimDeclarations.projectId, proyectoId), eq(sensitiveClaimDeclarations.anglePresetKey, angulo)),
    )
    .limit(1);
  return Boolean(fila);
}

/** Las declaraciones de un proyecto propio, de la más reciente a la más antigua. Son su historial de pruebas. */
export async function listarDeclaraciones(actor: Actor, proyectoId: unknown): Promise<FilaDeclaracionAfirmacion[]> {
  const proyecto = await proyectoPropio(actor, proyectoId);
  return db()
    .select()
    .from(sensitiveClaimDeclarations)
    .where(eq(sensitiveClaimDeclarations.projectId, proyecto.id))
    .orderBy(desc(sensitiveClaimDeclarations.acceptedAt));
}

/**
 * Registra la declaración de un proyecto propio para un ángulo que la exige.
 *
 * `aceptado` tiene que ser expresamente `true`: una declaración no se deduce de que la petición llegara. Y el
 * ángulo tiene que ser uno que **la exija**; registrarla en uno que no la pide se rechaza con su motivo en lugar
 * de guardar una prueba de algo que nadie ha afirmado.
 */
export async function registrarDeclaracion(
  actor: Actor,
  proyectoId: unknown,
  angulo: unknown,
  aceptado: unknown,
  peticion: Request,
): Promise<FilaDeclaracionAfirmacion> {
  const proyecto = await proyectoPropio(actor, proyectoId);
  if (typeof angulo !== "string" || angulo === "") {
    throw new ErrorAnuncio(400, "Di de qué ángulo es la declaración: es lo que se está afirmando.");
  }
  const vista = await buscarAngulo(angulo);
  if (!vista) throw new ErrorAnuncio(400, "Ese ángulo no está en el catálogo: elige uno de la lista.");
  if (!vista.exigeDeclaracion) {
    throw new ErrorAnuncio(
      409,
      `El ángulo «${vista.nombre}» no afirma nada que haya que declarar, así que no hace falta ninguna declaración para pedir el guion.`,
    );
  }
  if (aceptado !== true) {
    throw new ErrorAnuncio(
      400,
      "Para seguir con este ángulo tienes que aceptar la declaración: sin ella no se puede pedir el guion.",
    );
  }
  const [fila] = await db()
    .insert(sensitiveClaimDeclarations)
    .values({
      projectId: proyecto.id,
      anglePresetKey: vista.clave,
      // El texto se guarda **de la versión vigente** y se lee de la fila para siempre: la redacción de mañana no
      // puede reescribir lo que alguien aceptó hoy.
      acceptedText: TEXTO_DECLARACION_VERACIDAD,
      ip: await ipDePeticion(peticion),
      acceptedBy: actor.id,
    })
    // Aceptar dos veces el mismo ángulo no es un error: la declaración que hay ya es la prueba.
    .onConflictDoNothing({
      target: [sensitiveClaimDeclarations.projectId, sensitiveClaimDeclarations.anglePresetKey],
    })
    .returning();
  if (fila) return fila;
  const [anterior] = await db()
    .select()
    .from(sensitiveClaimDeclarations)
    .where(
      and(
        eq(sensitiveClaimDeclarations.projectId, proyecto.id),
        eq(sensitiveClaimDeclarations.anglePresetKey, vista.clave),
      ),
    )
    .limit(1);
  if (!anterior) throw new ErrorAnuncio(500, "La declaración no se ha guardado. Vuelve a intentarlo.");
  return anterior;
}
