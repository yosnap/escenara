"use server";

import { type Ajustes, ErrorAjustes, guardarAjustes } from "@/server/ajustes";
import { exigirAdmin } from "@/server/auth/sesion";
import { enviarCorreo } from "@/server/correo";

export type ResultadoAjustes = { ok: true; ajustes: Ajustes } | { ok: false; campo?: keyof Ajustes; error: string };

/** Guarda los ajustes (solo administradores; la sesión se comprueba en la base de datos). */
export async function guardarAjustesAccion(
  cambios: Partial<Ajustes>,
  anteriores: Partial<Ajustes>,
): Promise<ResultadoAjustes> {
  const sesion = await exigirAdmin("/admin/ajustes");
  try {
    if (!anteriores || typeof anteriores !== "object") throw new Error("Recarga los ajustes antes de guardar.");
    return { ok: true, ajustes: await guardarAjustes(cambios, sesion.user.id, anteriores) };
  } catch (error) {
    if (error instanceof ErrorAjustes) return { ok: false, campo: error.campo, error: error.message };
    // Solo el mensaje: el objeto de error podría arrastrar valores de la configuración.
    console.error("[ajustes] no se han podido guardar; detalle omitido para proteger la configuración.");
    return { ok: false, error: "No se han podido guardar los ajustes." };
  }
}

/** Envía un correo de prueba a quien administra, con el servidor de correo guardado. */
export async function enviarCorreoPruebaAccion(): Promise<{ ok: boolean; mensaje: string }> {
  const sesion = await exigirAdmin("/admin/ajustes");
  try {
    const resultado = await enviarCorreo({
      para: sesion.user.email,
      asunto: "Correo de prueba de Escenara",
      texto: "Si lees esto, el servidor de correo de Escenara está bien configurado.",
      html: "<p>Si lees esto, el servidor de correo de Escenara está bien configurado.</p>",
    });
    return resultado.aceptado
      ? { ok: true, mensaje: `SMTP ha aceptado el correo para ${sesion.user.email}. No hay confirmación de entrega.` }
      : { ok: false, mensaje: "SMTP no ha aceptado el correo. Revisa la configuración." };
  } catch (error) {
    // El detalle (conexión rechazada, tiempo agotado…) solo va al registro del servidor, y solo el
    // mensaje: algunos errores de SMTP incluyen las credenciales enviadas.
    console.error("[ajustes] correo de prueba: fallo de transporte; detalle privado omitido.");
    const codigo = (error as { responseCode?: number }).responseCode;
    return {
      ok: false,
      mensaje:
        codigo && codigo >= 400
          ? "SMTP ha rechazado el correo. Revisa el servidor, el puerto y el tipo de conexión."
          : "El resultado del envío es incierto. Comprueba el transporte antes de repetirlo.",
    };
  }
}
