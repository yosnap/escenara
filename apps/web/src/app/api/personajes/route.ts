import { listarPersonajes } from "@/server/personajes/consulta";
import { leerCuerpo, manejador } from "@/server/personajes/http";
import { crearPersonaje } from "@/server/personajes/servicio";

export const dynamic = "force-dynamic";

/** Personajes propios, con su estado y lo que les falta para poder generar. */
export const GET = manejador(async (_: Request, __: unknown, actor) => {
  return Response.json(await listarPersonajes(actor));
});

/** Crea un personaje: `{ nombre, tipo, especie?, descripcion? }`. Nace en `borrador`. */
export const POST = manejador(async (peticion: Request, _: unknown, actor) => {
  const cuerpo = await leerCuerpo(peticion);
  const personaje = await crearPersonaje(actor, {
    nombre: cuerpo.nombre,
    tipo: cuerpo.tipo,
    especie: cuerpo.especie,
    descripcion: cuerpo.descripcion,
  });
  return Response.json(personaje, { status: 201 });
});
