"use server";

import { revalidatePath } from "next/cache";
import { type AccionUsuario, cambiarPolitica, cambiarUsuario } from "@/server/admin/acciones-usuario";
import { reenviarActivacion } from "@/server/admin/correo-activacion";
import { type AccionPapelera, gestionarPapelera } from "@/server/admin/papelera-usuarios";
import { exigirAdmin } from "@/server/auth/sesion";

export type ResultadoUsuario = { ok: boolean; mensaje: string };
export async function gestionarUsuario(_previo: ResultadoUsuario, form: FormData): Promise<ResultadoUsuario> {
  const sesion = await exigirAdmin("/admin/usuarios");
  const id = String(form.get("usuario") ?? "");
  const accion = String(form.get("accion") ?? "");
  const motivo = String(form.get("motivo") ?? "");
  const operacion = String(form.get("operacion") ?? "");
  try {
    if (form.get("confirmar") !== "on") throw new Error("Confirma la cuenta destinataria antes de continuar.");
    let mensaje = "Cambio guardado y auditado.";
    if (["eliminar", "restaurar", "definitivo"].includes(accion)) {
      await gestionarPapelera(sesion.user.id, id, accion as AccionPapelera, motivo, operacion);
      mensaje =
        accion === "eliminar"
          ? "Cuenta enviada a eliminados. Sus datos se conservan."
          : accion === "restaurar"
            ? "Cuenta restaurada; las sesiones revocadas no se recuperan."
            : "Borrado definitivo autorizado. El worker completará la conciliación y limpieza.";
    } else if (accion === "correo") {
      const estado = await reenviarActivacion(sesion.user.id, id, motivo, operacion);
      mensaje =
        estado === "aceptado"
          ? "SMTP ha aceptado el correo. No hay confirmación de entrega."
          : estado === "fallido"
            ? "SMTP ha rechazado el correo. La cuenta sigue pendiente."
            : "Solicitud registrada; el resultado del envío es incierto. No se reenvía automáticamente.";
    } else if (accion === "politica") {
      const valor = (clave: string) => (form.get(clave) === "" ? null : Number(form.get(clave)));
      await cambiarPolitica(
        sesion.user.id,
        id,
        {
          budgetMode: form.get("budgetMode"),
          budgetValue: valor("budgetValue"),
          jobMode: form.get("jobMode"),
          jobValue: valor("jobValue"),
        },
        motivo,
        operacion,
      );
    } else await cambiarUsuario(sesion.user.id, id, accion as AccionUsuario, motivo, operacion);
    revalidatePath("/admin");
    revalidatePath("/admin/usuarios");
    revalidatePath(`/admin/usuarios/${id}`);
    return { ok: true, mensaje };
  } catch (error) {
    // Errores SQL pueden incluir parámetros privados: solo mostrar errores de negocio conocidos.
    const mensaje =
      error instanceof Error &&
      !(error as { cause?: unknown }).cause &&
      !/query|sql|connection|constraint/i.test(error.message)
        ? error.message
        : "No se ha podido completar la operación. Recarga y comprueba el historial antes de repetirla.";
    return { ok: false, mensaje };
  }
}
