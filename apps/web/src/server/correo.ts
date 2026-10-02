import nodemailer, { type Transporter } from "nodemailer";
import { type Ajustes, leerAjustes } from "./ajustes";
import { huellaSecretos, leerSecreto } from "./boveda/secretos";
import { enviarPorResend } from "./correo-resend";

/**
 * Correo por Resend o SMTP, según Admin › Ajustes. Las credenciales se leen de la bóveda cifrada.
 * Para QA local se selecciona SMTP con Mailpit; los tests inyectan un transporte sin salida a internet.
 */
const global = globalThis as {
  __escenaraCorreo?: { clave: string; transporte: Transporter };
  __escenaraTransporteFijo?: Transporter;
};

/**
 * Fija el transporte que se usará en lugar del proveedor configurado. Es el punto de inyección para las
 * pruebas (la preload de `bun test` pone uno que no envía nada, ver `correo-de-prueba.ts`): así la suite no
 * llena la bandeja de Mailpit y el camino de producción queda intacto.
 */
export function fijarTransporte(transporteFijo: Transporter | null): void {
  global.__escenaraTransporteFijo = transporteFijo ?? undefined;
}

/**
 * Transporte reutilizado mientras no cambie la configuración. La clave de caché lleva una huella de la
 * contraseña cifrada (fecha y longitud del valor guardado), nunca la contraseña.
 */
async function transporte(ajustes: Ajustes): Promise<Transporter> {
  if (global.__escenaraTransporteFijo) return global.__escenaraTransporteFijo;
  const clave = JSON.stringify([
    ajustes.smtpHost,
    ajustes.smtpPuerto,
    ajustes.smtpSeguro,
    ajustes.smtpUsuario,
    await huellaSecretos(["smtpContrasena"]),
  ]);
  if (global.__escenaraCorreo?.clave !== clave) {
    const contrasena = ajustes.smtpUsuario ? await leerSecreto("smtpContrasena") : null;
    global.__escenaraCorreo = {
      clave,
      transporte: nodemailer.createTransport({
        host: ajustes.smtpHost,
        port: ajustes.smtpPuerto,
        secure: ajustes.smtpSeguro,
        ...(ajustes.smtpUsuario
          ? { auth: { user: ajustes.smtpUsuario, ...(contrasena ? { pass: contrasena } : {}) } }
          : {}),
      }),
    };
  }
  return global.__escenaraCorreo.transporte;
}

export interface Correo {
  para: string;
  asunto: string;
  texto: string;
  html: string;
}

export async function enviarCorreo({ para, asunto, texto, html }: Correo): Promise<{ aceptado: boolean }> {
  const ajustes = await leerAjustes();
  if (!global.__escenaraTransporteFijo && ajustes.correoProveedor === "resend")
    return enviarPorResend(await leerSecreto("resendApiKey"), {
      from: ajustes.correoRemitente,
      to: [para],
      subject: asunto,
      text: texto,
      html,
    });
  const resultado = await (await transporte(ajustes)).sendMail({
    from: ajustes.correoRemitente,
    to: para,
    subject: asunto,
    text: texto,
    html,
  });
  return {
    aceptado:
      Array.isArray(resultado.accepted) &&
      resultado.accepted.some(
        (destino: string | { address: string }) =>
          (typeof destino === "string" ? destino : destino.address).toLowerCase() === para.toLowerCase(),
      ),
  };
}

/** Envía sin bloquear la respuesta (evita revelar por el tiempo si una cuenta existe) y registra los fallos. */
export function enviarEnSegundoPlano(correo: Correo): void {
  // No registrar el error del proveedor: puede contener credenciales o contenido del mensaje.
  enviarCorreo(correo).catch(() =>
    console.error("[correo] no se ha podido confirmar el envío; detalle privado omitido."),
  );
}

export { plantillaEnlace } from "@/lib/plantillas-correo";
