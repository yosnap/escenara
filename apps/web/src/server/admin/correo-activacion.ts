import { createEmailVerificationToken } from "better-auth/api";
import { and, eq, gte, or } from "drizzle-orm";
import { auth } from "../auth/auth";
import { exigirCuentaOperativa } from "../auth/estado-cuenta";
import { enviarCorreo, plantillaEnlace } from "../correo";
import { db } from "../db/cliente";
import { adminEvents, adminMailEvents, users } from "../db/esquema";
import { auditar, bloquearAdministracion, operacionRepetida, validarOperacion } from "./auditoria";

export async function reenviarActivacion(
  actorId: string,
  id: string,
  motivo: string,
  operationId: string,
): Promise<string> {
  const reason = validarOperacion(id, motivo, operationId);
  const solicitud = await db().transaction(async (tx) => {
    await bloquearAdministracion(tx, actorId, id);
    if (await operacionRepetida(tx, operationId, actorId, id, "correo", reason)) return null;
    await exigirCuentaOperativa(id, tx);
    const [usuario] = await tx
      .select({ name: users.name, email: users.email, emailVerified: users.emailVerified })
      .from(users)
      .where(eq(users.id, id));
    if (!usuario || usuario.emailVerified) throw new Error("Solo se reenvía a una cuenta pendiente de verificar.");
    const [reciente] = await tx
      .select({ id: adminMailEvents.id })
      .from(adminMailEvents)
      .where(
        and(
          or(eq(adminMailEvents.userId, id), eq(adminMailEvents.actorId, actorId)),
          gte(adminMailEvents.createdAt, new Date(Date.now() - 60_000)),
        ),
      )
      .limit(1);
    if (reciente) throw new Error("Espera un minuto antes de volver a solicitar un correo.");
    await tx.insert(adminMailEvents).values({ userId: id, actorId, operationId });
    await auditar(tx, { actorId, targetId: id, action: "correo", reason, operationId, result: "solicitado" });
    return usuario;
  });
  if (!solicitud) {
    const [previa] = await db()
      .select({ state: adminMailEvents.state })
      .from(adminMailEvents)
      .where(eq(adminMailEvents.operationId, operationId));
    return previa?.state ?? "incierto";
  }
  let estado = "incierto";
  try {
    const ctx = await (await auth()).$context;
    const token = await createEmailVerificationToken(ctx.secret, solicitud.email, undefined, 24 * 60 * 60);
    const url = `${ctx.baseURL}/verify-email?token=${encodeURIComponent(token)}&callbackURL=${encodeURIComponent("/entrar")}`;
    const resultado = await enviarCorreo({
      para: solicitud.email,
      asunto: "Confirma tu correo en Escenara",
      ...plantillaEnlace({
        nombre: solicitud.name,
        titulo: "Confirma tu correo",
        texto: "Confirma tu correo para activar tu cuenta.",
        boton: "Confirmar mi correo",
        url,
        nota: "El enlace caduca en 24 horas.",
      }),
    });
    estado = resultado.aceptado ? "aceptado" : "fallido";
  } catch (error) {
    // Un rechazo SMTP explícito prueba fallo; una conexión cortada puede haber aceptado el mensaje.
    const codigo = (error as { responseCode?: number }).responseCode;
    estado = codigo && codigo >= 400 ? "fallido" : "incierto";
  }
  try {
    await db().transaction(async (tx) => {
      await tx
        .update(adminMailEvents)
        .set({ state: estado, finishedAt: new Date() })
        .where(eq(adminMailEvents.operationId, operationId));
      await tx.update(adminEvents).set({ result: estado }).where(eq(adminEvents.operationId, operationId));
    });
  } catch {
    // Solicitud persistida sin cierre = resultado desconocido. Nunca se repite SMTP automáticamente.
    return "incierto";
  }
  return estado;
}
