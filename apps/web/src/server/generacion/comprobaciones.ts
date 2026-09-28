import { and, eq, isNull } from "drizzle-orm";
import { esProveedor, PROVEEDORES_PUBLICOS, type Proveedor } from "@/lib/boveda";
import type { ModeloVista } from "@/lib/catalogo";
import { DIALOGO_MAXIMO, PROMPT_MAXIMO, PROMPT_MINIMO } from "@/lib/generacion";
import { leerAjustes } from "../ajustes";
import { leerObjeto } from "../almacenamiento";
import { usarCredencialValida } from "../boveda/credenciales";
import { db } from "../db/cliente";
import { type FilaMedio, media } from "../db/esquema";
import { dentroDelLimite, type Limite } from "../limite";
import type { Buscador } from "../proveedores/codigos";
import { ErrorGeneracion } from "./errores";
import { saldoDelUsuario } from "./estimacion";
import { esUuidGeneracion } from "./trabajos";

/**
 * Comprobaciones previas a gastar dinero, una por regla, y las dos lecturas de la imagen de referencia.
 * Están aparte del servicio para que se lean de una vez: son las que deciden que **nada** se envía sin
 * confirmación del coste mostrado, sin derechos, sin credencial utilizable, sin cuota, sin saldo y dentro
 * del ritmo permitido.
 */

/** Ritmo máximo de envíos por usuario: un accidente (o un script) no puede vaciarle la cuenta. */
export const RITMO_ENVIOS: Limite = { ventanaSegundos: 60 * 60, maximo: 40 };

/**
 * Descripción de un clip **dirigido**, donde puede ir vacía (0.25.2).
 *
 * Al animar una imagen que ya existe, lo que se ve lo dice la imagen y el encuadre lo dice la dirección: exigir
 * además un párrafo describiendo la escena era pedir por segunda vez algo que ya está pedido, y dejaba el
 * botón apagado sin nada que tocar. Si escribe algo, se limpia y se acota igual que siempre.
 */
export function limpiarPromptOpcional(prompt: unknown): string {
  const texto = typeof prompt === "string" ? prompt.trim().replace(/\s+/g, " ") : "";
  if (texto === "") return "";
  return limpiarPrompt(texto);
}

export function limpiarPrompt(prompt: unknown): string {
  const texto = typeof prompt === "string" ? prompt.trim().replace(/\s+/g, " ") : "";
  if (texto.length < PROMPT_MINIMO) {
    throw new ErrorGeneracion(400, `Describe la escena con al menos ${PROMPT_MINIMO} caracteres.`);
  }
  if (texto.length > PROMPT_MAXIMO) {
    throw new ErrorGeneracion(400, `La descripción no puede pasar de ${PROMPT_MAXIMO} caracteres.`);
  }
  return texto;
}

/**
 * Limpia lo que dice el personaje. Se quitan los saltos de línea y las comillas: el diálogo se le pasa a
 * Veo con dos puntos y sin comillas, que es lo que menos texto incrustado provoca.
 */
export function limpiarDialogo(dialogo: unknown): string {
  if (dialogo === undefined || dialogo === null || dialogo === "") return "";
  if (typeof dialogo !== "string") throw new ErrorGeneracion(400, "Lo que dice tiene que ser texto.");
  // El tope se comprueba **antes** de limpiar: ninguna expresión regular recorre un texto enorme.
  if (dialogo.length > DIALOGO_MAXIMO) {
    throw new ErrorGeneracion(400, `Lo que dice no puede pasar de ${DIALOGO_MAXIMO} caracteres.`);
  }
  return dialogo
    .replace(/[\r\n"“”«»‘’']+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Revisión de las referencias antes de enviarlas al proveedor (ADR-0009). La reducción de tamaño ya la hace
 * la biblioteca al subir (`server/media/procesado.ts` recorta a 1920 × 1080 y guarda en WebP); lo que
 * falta es el aviso: quien genera con un personaje confirma expresamente que en sus fotos no aparece ninguna
 * otra persona ni ningún menor. Es un control, no una comprobación: nadie puede verificarlo por él.
 */
export function exigirRevisionDeReferencias(sinTerceros: unknown) {
  if (sinTerceros !== true) {
    throw new ErrorGeneracion(
      400,
      "Confirma que en las fotos del personaje no aparece ninguna otra persona ni ningún menor antes de enviarlas al proveedor.",
    );
  }
}

export function exigirDerechos(derechos: unknown) {
  if (derechos !== true) {
    throw new ErrorGeneracion(400, "Confirma que tienes derecho a usar esa imagen antes de generar.");
  }
}

/** La confirmación vale para el precio que se mostró y para ningún otro. */
export function exigirConfirmacion(confirmados: unknown, creditos: number) {
  if (typeof confirmados !== "number" || !Number.isFinite(confirmados)) {
    throw new ErrorGeneracion(400, "Falta la confirmación del coste estimado.");
  }
  if (confirmados !== creditos) {
    throw new ErrorGeneracion(
      409,
      `El coste estimado ha cambiado: ahora son ${creditos} créditos. Revísalo y vuelve a confirmar.`,
    );
  }
}

/** El aviso por gasto alto lo comprueba el servidor: es un aviso obligatorio, no un tope. */
export async function exigirAvisoUmbral(creditos: number, aceptado: unknown) {
  const { avisoCreditos } = await leerAjustes();
  if (creditos > avisoCreditos && aceptado !== true) {
    throw new ErrorGeneracion(
      400,
      `Este trabajo pasa del aviso de ${avisoCreditos} créditos. Confirma que quieres gastarlos.`,
    );
  }
}

/** Clave de idempotencia: la genera el navegador y tiene que ser un UUID. */
export function exigirClaveIdempotencia(clave: unknown): string {
  if (!esUuidGeneracion(clave)) throw new ErrorGeneracion(400, "Falta la clave de la confirmación.");
  return clave;
}

/**
 * El trabajo se paga siempre con la clave del usuario para el proveedor del modelo, así que un proveedor
 * que todavía no admite credenciales (el hueco de Google, ADR-0009) no puede recibir trabajos.
 */
export function proveedorDeCredencial(modelo: ModeloVista): Proveedor {
  if (!esProveedor(modelo.proveedor)) {
    throw new ErrorGeneracion(503, `Esta instalación aún no puede pagar trabajos en ${modelo.nombreProveedor}.`);
  }
  return modelo.proveedor;
}

export async function exigirCredencial(usuarioId: string, proveedor: Proveedor): Promise<string> {
  const credencial = await usarCredencialValida(usuarioId, proveedor);
  if (credencial.ok) return credencial.clave;
  const nombre = PROVEEDORES_PUBLICOS[proveedor].nombre;
  const MENSAJE = {
    boveda: "Esta instalación aún no admite credenciales: pídeselo a quien la administra.",
    "sin-credencial": `No tienes ninguna clave de ${nombre} guardada. Añádela en «Tu cuenta».`,
    invalida: `Tu clave de ${nombre} está marcada como no válida. Pruébala o sustitúyela en «Tu cuenta».`,
    ilegible: "La clave guardada no se puede leer en esta instalación. Bórrala y vuelve a guardarla.",
  } as const;
  throw new ErrorGeneracion(409, MENSAJE[credencial.motivo]);
}

export async function exigirRitmo(usuarioId: string) {
  if (!(await dentroDelLimite(`generacion:envio:${usuarioId}`, RITMO_ENVIOS))) {
    throw new ErrorGeneracion(429, "Has pedido demasiadas generaciones seguidas. Espera un rato.");
  }
}

export async function exigirSaldo(usuarioId: string, creditos: number, buscar: Buscador, proveedor: Proveedor) {
  const saldo = await saldoDelUsuario(usuarioId, buscar, proveedor);
  if (saldo !== null && saldo < creditos) {
    const nombre = PROVEEDORES_PUBLICOS[proveedor].nombre;
    throw new ErrorGeneracion(
      402,
      `Tu cuenta de ${nombre} tiene ${saldo} créditos y este trabajo necesita ${creditos}. Recarga créditos en el proveedor.`,
    );
  }
}

/**
 * Identificador de la imagen de referencia, ya validado como UUID. Se valida **antes** de consultar nada, y
 * aparte de la lectura, porque el motor de controles necesita el identificador para saber si esa imagen salió
 * de un trabajo con personaje (y entonces hereda sus reglas) antes de mirar si la imagen sigue existiendo.
 */
export function exigirMedioElegido(medioId: unknown): string {
  if (!esUuidGeneracion(medioId)) throw new ErrorGeneracion(400, "Elige una imagen de referencia.");
  return medioId;
}

/** Imagen propia, existente y fuera de la papelera: lo ajeno responde 404, como en la biblioteca. */
export async function imagenPropia(usuarioId: string, medioId: unknown): Promise<FilaMedio> {
  const id = exigirMedioElegido(medioId);
  const [fila] = await db()
    .select()
    .from(media)
    .where(and(eq(media.id, id), eq(media.ownerId, usuarioId), isNull(media.deletedAt)))
    .limit(1);
  if (!fila) throw new ErrorGeneracion(404, "La imagen no existe.");
  if (fila.kind !== "imagen") throw new ErrorGeneracion(400, "La referencia tiene que ser una imagen.");
  // Un documento de consentimiento no sale nunca hacia un proveedor: es un documento de identidad ajeno.
  if (fila.isDocument) {
    throw new ErrorGeneracion(400, "Un documento de consentimiento no se puede usar como imagen de referencia.");
  }
  return fila;
}

/** Baja el archivo del almacenamiento propio para subirlo al proveedor. */
export async function archivoDe(fila: FilaMedio): Promise<File> {
  const datos = await leerObjeto(fila.storageKey).arrayBuffer();
  return new File([datos], fila.originalName || "referencia", { type: fila.mimeType });
}
