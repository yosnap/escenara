import { exigirMismoOrigen, leerCuerpo, respuestaError } from "@/server/asistente/http";
import { esAdmin, sesionDePeticion } from "@/server/auth/sesion";
import {
  borradoAbiertoDe,
  cancelarBorradoCuenta,
  pedirBorradoCuenta,
  resumenBorradoCuenta,
  vistaBorrado,
} from "@/server/datos/borrado-cuenta";
import { dentroDelLimite } from "@/server/limite";

export const dynamic = "force-dynamic";

const sinSesion = () => Response.json({ error: "Inicia sesión para continuar." }, { status: 401 });

/** Qué se borraría y si ya hay un borrado programado. Una cuenta en su periodo de gracia también puede verlo. */
export async function GET(peticion: Request): Promise<Response> {
  try {
    const sesion = await sesionDePeticion(peticion, { permitirBorradoProgramado: true });
    if (!sesion) return sinSesion();
    const [resumen, abierto] = await Promise.all([
      resumenBorradoCuenta(sesion.user.id),
      borradoAbiertoDe(sesion.user.id),
    ]);
    return Response.json({ resumen, borrado: abierto ? vistaBorrado(abierto) : null, esAdmin: esAdmin(sesion) });
  } catch (error) {
    return respuestaError(error);
  }
}

/** Programa el borrado: frase escrita, sesión reciente y periodo de gracia. */
export async function POST(peticion: Request): Promise<Response> {
  try {
    exigirMismoOrigen(peticion);
    const sesion = await sesionDePeticion(peticion);
    if (!sesion) return sinSesion();
    if (!(await dentroDelLimite(`cuenta:borrado:${sesion.user.id}`, { ventanaSegundos: 3600, maximo: 10 }))) {
      return Response.json({ error: "Demasiados intentos. Espera un rato y vuelve a intentarlo." }, { status: 429 });
    }
    const cuerpo = await leerCuerpo(peticion);
    const borrado = await pedirBorradoCuenta(
      { usuarioId: sesion.user.id, sesionId: sesion.session.id, creadaEn: new Date(sesion.session.createdAt) },
      cuerpo.frase,
    );
    return Response.json({ borrado }, { status: 201 });
  } catch (error) {
    return respuestaError(error);
  }
}

/** Cancela el borrado mientras siga en su periodo de gracia. */
export async function DELETE(peticion: Request): Promise<Response> {
  try {
    exigirMismoOrigen(peticion);
    const sesion = await sesionDePeticion(peticion, { permitirBorradoProgramado: true });
    if (!sesion) return sinSesion();
    await cancelarBorradoCuenta(sesion.user.id);
    return Response.json({ ok: true });
  } catch (error) {
    return respuestaError(error);
  }
}
