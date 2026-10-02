/** Mensaje seguro: nunca incorpora la respuesta del proveedor, credenciales ni contenido del correo. */
export class ErrorCorreo extends Error {
  constructor(
    mensaje: string,
    public readonly rechazado = false,
  ) {
    super(mensaje);
  }
}

interface MensajeResend {
  from: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
}

/** API oficial. Sin reintentos ni cambio de proveedor ante una respuesta incierta. */
export async function enviarPorResend(
  clave: string | null,
  mensaje: MensajeResend,
  solicitar: (url: string, opciones: RequestInit) => Promise<Response> = fetch,
): Promise<{ aceptado: boolean }> {
  if (!clave) throw new ErrorCorreo("Configura la clave API de Resend en Admin › Ajustes.", true);
  let respuesta: Response;
  try {
    respuesta = await solicitar("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${clave}`,
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify(mensaje),
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    });
  } catch {
    throw new ErrorCorreo("El resultado del envío por Resend es incierto. Comprueba su panel antes de repetirlo.");
  }
  if (!respuesta.ok)
    throw new ErrorCorreo(
      `Resend no ha confirmado el envío (HTTP ${respuesta.status}). Revisa la clave, el dominio y los límites.`,
      respuesta.status >= 400 && respuesta.status < 500 && ![408, 409].includes(respuesta.status),
    );
  const datos = await respuesta.json().catch(() => null);
  if (!datos || typeof datos.id !== "string" || datos.id.length === 0)
    throw new ErrorCorreo("Resend no ha devuelto una confirmación válida. Comprueba su panel antes de repetirlo.");
  return { aceptado: true };
}
