"use server";

import { type Ajustes, ErrorAjustes, guardarAjustes, leerAjustes } from "@/server/ajustes";
import { exigirAdmin } from "@/server/auth/sesion";
import { enviarCorreo, plantillaEnlace } from "@/server/correo";
import { ErrorCorreo } from "@/server/correo-resend";

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
    const ajustes = await leerAjustes();
    const base = ajustes.urlPublica || process.env.BETTER_AUTH_URL || "http://localhost:3021";
    const resultado = await enviarCorreo({
      para: sesion.user.email,
      asunto: "Correo de prueba de Escenara",
      ...plantillaEnlace({
        nombre: sesion.user.name,
        titulo: "Tu correo está listo",
        texto:
          "El proveedor ha aceptado este correo de prueba de Escenara. Comprueba su llegada y presentación en tu bandeja.",
        boton: "Abrir administración",
        url: `${base.replace(/\/+$/, "")}/admin/ajustes`,
        nota: "Este envío se ha solicitado desde la administración de tu instalación.",
      }),
    });
    return resultado.aceptado
      ? {
          ok: true,
          mensaje: `El proveedor ha aceptado el correo para ${sesion.user.email}. No hay confirmación de entrega.`,
        }
      : { ok: false, mensaje: "El proveedor no ha aceptado el correo. Revisa la configuración." };
  } catch (error) {
    if (error instanceof ErrorCorreo) return { ok: false, mensaje: error.message };
    // Omitir el error del transporte: puede contener credenciales o contenido del correo.
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
