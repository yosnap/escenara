import { exigirRitmoDeEscritura, leerCuerpo, manejador } from "@/server/comunidad/http";
import { publicar } from "@/server/comunidad/publicar";

export const dynamic = "force-dynamic";

/**
 * Publica una copia de un original propio: `{ origen: { tipo: "personaje" | "medio", id }, tipo, titulo, descripcion?,
 * firma, reto?, declaracion: true }`. 201 si se crea; 200 con la que ya existía si se publica dos veces lo mismo. Nace
 * **pendiente de moderación**: nadie más la ve hasta que se apruebe.
 */
export const POST = manejador(async (peticion: Request, _: unknown, actor) => {
  await exigirRitmoDeEscritura(actor);
  const cuerpo = await leerCuerpo(peticion);
  const { publicacion, creada } = await publicar(actor, {
    origen: cuerpo.origen,
    tipo: cuerpo.tipo,
    titulo: cuerpo.titulo,
    descripcion: cuerpo.descripcion,
    firma: cuerpo.firma,
    reto: cuerpo.reto,
    declaracion: cuerpo.declaracion,
  });
  return Response.json(publicacion, { status: creada ? 201 : 200 });
});
