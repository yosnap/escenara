import { eq } from "drizzle-orm";
import { fechaLarga } from "@/lib/fechas";
import { leerAjustes } from "../ajustes";
import { enviarEnSegundoPlano, plantillaEnlace } from "../correo";
import { db } from "../db/cliente";
import { users } from "../db/esquema";

/**
 * Correos al titular de la cuenta al **pedir** y al **cancelar** su borrado: si no fue él, se entera a tiempo. El
 * enlace lleva a `/cuenta/borrado`, que exige entrar: ningún correo permite cancelar (ni confirmar) sin sesión.
 */

async function destinatario(usuarioId: string): Promise<{ nombre: string; correo: string } | null> {
  const [fila] = await db()
    .select({ nombre: users.name, correo: users.email })
    .from(users)
    .where(eq(users.id, usuarioId));
  return fila ?? null;
}

async function urlDelBorrado(): Promise<string> {
  const base = (await leerAjustes()).urlPublica || process.env.BETTER_AUTH_URL || "http://localhost:3021";
  return `${base.replace(/\/+$/, "")}/cuenta/borrado`;
}

export async function avisarBorradoPedido(usuarioId: string, cuando: Date): Promise<void> {
  const d = await destinatario(usuarioId);
  if (!d) return;
  enviarEnSegundoPlano({
    para: d.correo,
    asunto: "Has pedido borrar tu cuenta de Escenara",
    ...plantillaEnlace({
      nombre: d.nombre,
      titulo: "Tu cuenta se va a borrar",
      texto: `Se ha pedido borrar tu cuenta. Se borrará todo a partir del ${fechaLarga(cuando)}. Hasta entonces está desactivada: puedes entrar para cancelar el borrado, ver tu historial y descargar tus proyectos.`,
      boton: "Ver o cancelar el borrado (tendrás que entrar)",
      url: await urlDelBorrado(),
      nota: "Para cancelarlo, entra y pulsa «Cancelar el borrado», o restablece tu contraseña desde «He olvidado mi contraseña»: restablecerla también cancela el borrado. Si no lo has pedido tú, alguien ha entrado en tu cuenta: haz una de las dos cosas y cambia tu contraseña.",
    }),
  });
}

export async function avisarBorradoCancelado(usuarioId: string): Promise<void> {
  const d = await destinatario(usuarioId);
  if (!d) return;
  enviarEnSegundoPlano({
    para: d.correo,
    asunto: "Se ha cancelado el borrado de tu cuenta de Escenara",
    ...plantillaEnlace({
      nombre: d.nombre,
      titulo: "Tu cuenta sigue activa",
      texto: "Se ha cancelado el borrado de tu cuenta y vuelve a estar activa, con todos tus datos.",
      boton: "Entrar en tu cuenta",
      url: (await urlDelBorrado()).replace(/\/cuenta\/borrado$/, "/cuenta"),
      nota: "Si no lo has cancelado tú, alguien ha entrado en tu cuenta: cambia tu contraseña y cierra las demás sesiones en «Tu cuenta».",
    }),
  });
}

export async function avisarBorradoCanceladoPorRestablecimiento(usuarioId: string): Promise<void> {
  const d = await destinatario(usuarioId);
  if (!d) return;
  enviarEnSegundoPlano({
    para: d.correo,
    asunto: "Se ha cancelado el borrado de tu cuenta de Escenara",
    ...plantillaEnlace({
      nombre: d.nombre,
      titulo: "Tu cuenta sigue activa",
      texto:
        "Se ha cancelado el borrado de tu cuenta porque restableciste tu contraseña. Vuelve a estar activa, con todos tus datos.",
      boton: "Entrar en tu cuenta",
      url: (await urlDelBorrado()).replace(/\/cuenta\/borrado$/, "/cuenta"),
      nota: "Si no has restablecido tú la contraseña, alguien tiene acceso a tu correo: protégelo y vuelve a restablecerla.",
    }),
  });
}
