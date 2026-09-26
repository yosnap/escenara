import nodemailer, { type Transporter } from "nodemailer";
import { type Ajustes, leerAjustes } from "./ajustes";

/**
 * Envío de correo por SMTP con el servidor y el remitente de Admin › Ajustes. En local, Mailpit
 * (bandeja en http://localhost:8421): nada sale a internet. La contraseña del servidor llegará con la
 * bóveda de secretos (0.9.0); hasta entonces, solo servidores sin autenticación o con usuario sin clave.
 */
const global = globalThis as { __escenaraCorreo?: { clave: string; transporte: Transporter } };

function transporte(ajustes: Ajustes): Transporter {
  const clave = JSON.stringify([ajustes.smtpHost, ajustes.smtpPuerto, ajustes.smtpSeguro, ajustes.smtpUsuario]);
  if (global.__escenaraCorreo?.clave !== clave) {
    global.__escenaraCorreo = {
      clave,
      transporte: nodemailer.createTransport({
        host: ajustes.smtpHost,
        port: ajustes.smtpPuerto,
        secure: ajustes.smtpSeguro,
        ...(ajustes.smtpUsuario ? { auth: { user: ajustes.smtpUsuario } } : {}),
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

export async function enviarCorreo({ para, asunto, texto, html }: Correo): Promise<void> {
  const ajustes = await leerAjustes();
  await transporte(ajustes).sendMail({
    from: ajustes.correoRemitente,
    to: para,
    subject: asunto,
    text: texto,
    html,
  });
}

/** Envía sin bloquear la respuesta (evita revelar por el tiempo si una cuenta existe) y registra los fallos. */
export function enviarEnSegundoPlano(correo: Correo): void {
  enviarCorreo(correo).catch((error) => console.error("[correo] no se ha podido enviar:", correo.asunto, error));
}

const escapar = (texto: string) =>
  texto.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

/** Plantilla sencilla con la marca: un saludo, un texto y un botón con enlace. */
export function plantillaEnlace({
  nombre,
  titulo,
  texto,
  boton,
  url,
  nota,
}: {
  nombre: string;
  titulo: string;
  texto: string;
  boton: string;
  url: string;
  nota: string;
}): Pick<Correo, "texto" | "html"> {
  return {
    texto: `Hola, ${nombre}:\n\n${texto}\n\n${boton}: ${url}\n\n${nota}\n\n— Escenara`,
    html: `<!doctype html><html lang="es"><body style="margin:0;background:#F7F8FC;font-family:Manrope,Arial,sans-serif;color:#182032">
<div style="max-width:520px;margin:32px auto;padding:32px;background:#FFFFFF;border:1px solid #858EA1;border-radius:16px">
<p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:2px;color:#B53D1C">ESCENARA</p>
<h1 style="margin:0 0 16px;font-size:24px">${escapar(titulo)}</h1>
<p style="margin:0 0 8px">Hola, ${escapar(nombre)}:</p>
<p style="margin:0 0 24px;line-height:1.5">${escapar(texto)}</p>
<a href="${escapar(url)}" style="display:inline-block;padding:12px 24px;background:#2753D7;color:#FFFFFF;border-radius:12px;font-weight:700;text-decoration:none">${escapar(boton)}</a>
<p style="margin:24px 0 0;font-size:14px;color:#485269;line-height:1.5">${escapar(nota)}</p>
</div></body></html>`,
  };
}
