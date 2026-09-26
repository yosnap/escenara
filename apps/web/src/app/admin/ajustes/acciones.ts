"use server";

import { type Ajustes, ErrorAjustes, guardarAjustes } from "@/server/ajustes";
import { exigirAdmin } from "@/server/auth/sesion";
import { enviarCorreo } from "@/server/correo";

export type ResultadoAjustes = { ok: true; ajustes: Ajustes } | { ok: false; campo?: keyof Ajustes; error: string };

/** Guarda los ajustes (solo administradores; la sesión se comprueba en la base de datos). */
export async function guardarAjustesAccion(cambios: Partial<Ajustes>): Promise<ResultadoAjustes> {
  const sesion = await exigirAdmin("/admin/ajustes");
  try {
    return { ok: true, ajustes: await guardarAjustes(cambios, sesion.user.id) };
  } catch (error) {
    if (error instanceof ErrorAjustes) return { ok: false, campo: error.campo, error: error.message };
    console.error("[ajustes]", error);
    return { ok: false, error: "No se han podido guardar los ajustes." };
  }
}

/** Envía un correo de prueba a quien administra, con el servidor de correo guardado. */
export async function enviarCorreoPruebaAccion(): Promise<{ ok: boolean; mensaje: string }> {
  const sesion = await exigirAdmin("/admin/ajustes");
  try {
    await enviarCorreo({
      para: sesion.user.email,
      asunto: "Correo de prueba de Escenara",
      texto: "Si lees esto, el servidor de correo de Escenara está bien configurado.",
      html: "<p>Si lees esto, el servidor de correo de Escenara está bien configurado.</p>",
    });
    return { ok: true, mensaje: `Enviado a ${sesion.user.email}.` };
  } catch (error) {
    // El detalle (conexión rechazada, tiempo agotado…) solo va al registro del servidor.
    console.error("[ajustes] correo de prueba:", error);
    return { ok: false, mensaje: "No se ha podido enviar. Revisa el servidor, el puerto y el tipo de conexión." };
  }
}
