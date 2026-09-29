import { leerCuerpo, manejador } from "@/server/personajes/http";
import { crearPersonajeInventado } from "@/server/personajes/inventado";

export const dynamic = "force-dynamic";

/**
 * Crea un personaje **inventado**: `{ nombre, descripcion, tipo?, declaracion }`.
 *
 * Ruta propia y no la de siempre a propósito: un personaje inventado no registra consentimiento de nadie, no
 * admite fotos y declara otra cosa. Mezclarlo con el alta normal significaría que un solo campo del cuerpo
 * decide si se exige o no la declaración de mayoría de edad.
 */
export const POST = manejador(async (peticion: Request, _: unknown, actor) => {
  const cuerpo = await leerCuerpo(peticion);
  const personaje = await crearPersonajeInventado(actor, {
    nombre: cuerpo.nombre,
    descripcion: cuerpo.descripcion,
    tipo: cuerpo.tipo,
    declaracion: cuerpo.declaracion,
    estiloAnimado: cuerpo.estiloAnimado,
    guiaPaleta: cuerpo.guiaPaleta,
    guiaTrazo: cuerpo.guiaTrazo,
    guiaDetalle: cuerpo.guiaDetalle,
    guiaReferencias: cuerpo.guiaReferencias,
  });
  return Response.json(personaje, { status: 201 });
});
