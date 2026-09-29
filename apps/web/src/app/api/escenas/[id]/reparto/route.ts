import {
  type ContextoId,
  exigirMismoOrigen,
  exigirRitmoDeEscritura,
  leerCuerpo,
  leerId,
  manejador,
} from "@/server/asistente/http";
import {
  anadirAlReparto,
  cambiarEnElReparto,
  elegirFormatoDeReparto,
  leerReparto,
  leerTurnosPedidos,
  quitarDelReparto,
  repartirDialogo,
} from "@/server/reparto/servicio";

export const dynamic = "force-dynamic";

/** Reparto de la escena: formato, quién sale y el diálogo repartido. Una escena ajena responde 404. */
export const GET = manejador(async (_: Request, contexto: ContextoId, actor) =>
  Response.json(await leerReparto(actor, await leerId(contexto))),
);

/**
 * Cambia el reparto. Una sola ruta con `accion` porque las cinco son la misma cosa —quién sale en esta escena y
 * qué dice—, y separarlas solo multiplicaría el envoltorio:
 *
 * - `formato`: `{ formato: "solo" | "podcast" | "dualcast" }`;
 * - `anadir`: `{ personajeId, papel?, lado?, mirada? }`, como mucho dos y solo personajes propios;
 * - `cambiar`: `{ miembroId, papel?, lado?, mirada? }`;
 * - `quitar`: `{ miembroId }`, que se lleva también sus turnos;
 * - `dialogo`: `{ turnos: [{ personajeId, texto, direccion? }] }`, en ese orden y solo de quien sale.
 */
export const PATCH = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  exigirMismoOrigen(peticion);
  await exigirRitmoDeEscritura(actor, "reparto");
  const id = await leerId(contexto);
  const cuerpo = await leerCuerpo(peticion);
  switch (cuerpo.accion) {
    case "anadir":
      return Response.json(
        await anadirAlReparto(actor, id, {
          personajeId: cuerpo.personajeId,
          papel: cuerpo.papel,
          lado: cuerpo.lado,
          mirada: cuerpo.mirada,
        }),
      );
    case "cambiar":
      return Response.json(
        await cambiarEnElReparto(actor, id, cuerpo.miembroId, {
          papel: cuerpo.papel,
          lado: cuerpo.lado,
          mirada: cuerpo.mirada,
        }),
      );
    case "quitar":
      return Response.json(await quitarDelReparto(actor, id, cuerpo.miembroId));
    case "dialogo":
      return Response.json(await repartirDialogo(actor, id, leerTurnosPedidos(cuerpo.turnos)));
    default:
      return Response.json(await elegirFormatoDeReparto(actor, id, cuerpo.formato));
  }
});
