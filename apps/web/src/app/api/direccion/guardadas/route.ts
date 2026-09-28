import { exigirMismoOrigen, exigirRitmoDeEscritura, leerCuerpo, manejador } from "@/server/asistente/http";
import { guardarDireccion, listarDirecciones } from "@/server/direccion/guardadas";

export const dynamic = "force-dynamic";

/**
 * **Mis direcciones**: las formas de dirigir un clip que esta persona ha guardado con nombre.
 *
 * Solo salen las suyas: el listado filtra por su identificador de sesión, no por lo que pida el navegador.
 * No hay prompt aquí, solo claves del catálogo y su texto en castellano (ADR-0022).
 */
export const GET = manejador(async (_peticion: Request, _contexto: unknown, actor) =>
  Response.json(await listarDirecciones(actor.id)),
);

/** Guarda lo que hay elegido ahora con un nombre. No genera nada y no cuesta nada. */
export const POST = manejador(async (peticion: Request, _contexto: unknown, actor) => {
  exigirMismoOrigen(peticion);
  await exigirRitmoDeEscritura(actor, "direcciones");
  const guardada = await guardarDireccion(actor.id, await leerCuerpo(peticion));
  return Response.json(guardada, { status: 201 });
});
