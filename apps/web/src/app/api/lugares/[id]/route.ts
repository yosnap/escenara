import { borrarLugar, resumenBorradoLugar } from "@/server/lugares/borrado";
import { obtenerLugar } from "@/server/lugares/consulta";
import { declararLugar, revocarDeclaracionDeLugar } from "@/server/lugares/declaracion";
import { type ContextoId, exigirRitmoDeEscritura, leerCuerpo, leerId, manejador } from "@/server/lugares/http";
import {
  actualizarLugar,
  anadirFotosAlLugar,
  cambiarPapelDeFoto,
  leerFotosDeLugar,
  quitarFotoDelLugar,
} from "@/server/lugares/servicio";

export const dynamic = "force-dynamic";

/** Ficha completa. Uno ajeno responde 404, sin decir que existe. `?borrado=1` dice qué se borraría. */
export const GET = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  const id = await leerId(contexto);
  if (new URL(peticion.url).searchParams.get("borrado") === "1") {
    return Response.json(await resumenBorradoLugar(actor, id));
  }
  return Response.json(await obtenerLugar(actor, id));
});

/**
 * Cambia el lugar, sus fotos o su declaración:
 *
 * - sin `accion`: nombre o descripción;
 * - `anadir-fotos`, `papel`, `quitar-foto`: las fotos y su papel (una sola maestra);
 * - `declarar` y `revocar`: la declaración de derechos.
 */
export const PATCH = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  await exigirRitmoDeEscritura(actor);
  const id = await leerId(contexto);
  const cuerpo = await leerCuerpo(peticion);
  switch (cuerpo.accion) {
    case "anadir-fotos":
      return Response.json(await anadirFotosAlLugar(actor, id, leerFotosDeLugar(cuerpo.fotos)));
    case "papel":
      return Response.json(await cambiarPapelDeFoto(actor, id, cuerpo.referenciaId, cuerpo.papel));
    case "quitar-foto":
      return Response.json(await quitarFotoDelLugar(actor, id, cuerpo.referenciaId));
    case "declarar":
      return Response.json(await declararLugar(actor, id, cuerpo));
    case "revocar":
      return Response.json(await revocarDeclaracionDeLugar(actor, id, cuerpo.motivo));
    default:
      return Response.json(
        await actualizarLugar(actor, id, { nombre: cuerpo.nombre, descripcion: cuerpo.descripcion }),
      );
  }
});

/** Borra la ficha del lugar. Sus fotos y lo generado con él se quedan en la biblioteca. */
export const DELETE = manejador(async (_: Request, contexto: ContextoId, actor) =>
  Response.json(await borrarLugar(actor, await leerId(contexto))),
);
