import { HERRAMIENTAS } from "@/server/generacion/herramientas";
import { obtenerPersonaje } from "@/server/personajes/consulta";
import { type ContextoId, leerCuerpo, leerId, manejador } from "@/server/personajes/http";
import { quitarVozPropia, registrarVozPropia } from "@/server/personajes/voz-propia";
import { validarEleccionVozOmni } from "@/server/voz/omni";

export const dynamic = "force-dynamic";

/**
 * Voz registrada propia del personaje: `{ voz, descripcion, ejemplo }`. Es la que suena cuando habla en un podcast
 * o una entrevista. **No cuesta créditos**; tras registrarla se registra al personaje con ella, también gratis, y si
 * eso no se puede todavía la respuesta lleva `avisoRegistro` con el motivo.
 */
export const POST = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  const id = await leerId(contexto);
  const eleccion = validarEleccionVozOmni(await leerCuerpo(peticion));
  const { avisoRegistro } = await registrarVozPropia(actor, id, eleccion, HERRAMIENTAS);
  return Response.json({ personaje: await obtenerPersonaje(actor, id), avisoRegistro });
});

/** Quita la voz propia: vuelve a hablar con la voz del proyecto en el que salga. */
export const DELETE = manejador(async (_peticion: Request, contexto: ContextoId, actor) => {
  const id = await leerId(contexto);
  await quitarVozPropia(actor, id);
  return Response.json({ personaje: await obtenerPersonaje(actor, id), avisoRegistro: "" });
});
