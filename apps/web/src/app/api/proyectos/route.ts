import { exigirMismoOrigen, exigirRitmoDeEscritura, leerCuerpo, manejador } from "@/server/asistente/http";
import { listarProyectos } from "@/server/asistente/plan";
import { crearProyecto } from "@/server/asistente/proyectos";

export const dynamic = "force-dynamic";

/** Proyectos propios con su total estimado. Es una lectura: no mueve dinero. */
export const GET = manejador(async (_: Request, __: unknown, actor) => {
  return Response.json(await listarProyectos(actor));
});

/** Crea un proyecto: `{ titulo, formato, idea?, personajeId?, presupuestoCreditos? }`. Nace en `borrador`. */
export const POST = manejador(async (peticion: Request, _: unknown, actor) => {
  exigirMismoOrigen(peticion);
  await exigirRitmoDeEscritura(actor, "crear");
  const cuerpo = await leerCuerpo(peticion);
  return Response.json(await crearProyecto(actor, cuerpo), { status: 201 });
});
