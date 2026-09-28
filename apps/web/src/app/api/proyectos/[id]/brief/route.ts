import { leerAjustes } from "@/server/ajustes";
import { borrarBrief, guardarBrief, obtenerBrief } from "@/server/anuncio/brief";
import { listarAngulos } from "@/server/anuncio/catalogo";
import {
  type ContextoId,
  exigirBriefActivo,
  exigirRitmoDeEscritura,
  leerCuerpo,
  leerId,
  manejador,
} from "@/server/anuncio/http";
import { puedePedirGuion } from "@/server/anuncio/puerta-guion";
import { proyectoPropio } from "@/server/asistente/consulta";

export const dynamic = "force-dynamic";

/**
 * El brief del anuncio de un proyecto propio (0.27.0), con lo que la pantalla necesita para pintarlo entero: el
 * catálogo de ángulos elegibles, si el brief está encendido en esta instalación y si ya se puede pedir guion.
 *
 * `brief: null` **no es un error**: es un proyecto sin brief, que funciona como antes de esta versión. Un proyecto
 * ajeno responde 404, sin decir que existe.
 */
export const GET = manejador(async (_: Request, contexto: ContextoId, actor) => {
  const id = await leerId(contexto);
  const proyecto = await proyectoPropio(actor, id);
  const [brief, angulos, ajustes] = await Promise.all([
    obtenerBrief(actor, proyecto.id),
    listarAngulos(),
    leerAjustes(),
  ]);
  return Response.json({
    brief,
    angulos,
    activo: ajustes.anuncioBriefActivo,
    variantesActivas: ajustes.anuncioBriefActivo && ajustes.anuncioVariantesActivas,
    puerta: await puedePedirGuion(proyecto.id),
  });
});

/**
 * Crea o cambia el brief: `{ productoId?, publico?, versionMejor?, angulo?, ofertaId?, notas? }`. Lo que no se
 * envía se queda como estaba, así que la pantalla puede guardar campo a campo.
 *
 * `angulo` es **uno solo**, una clave del catálogo: una lista se rechaza diciendo por qué. Se devuelve además el
 * estado de la puerta del guion, que es lo que cambia al guardar.
 */
export const PUT = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  await exigirBriefActivo();
  await exigirRitmoDeEscritura(actor);
  const id = await leerId(contexto);
  const cuerpo = await leerCuerpo(peticion);
  const brief = await guardarBrief(actor, id, {
    productoId: cuerpo.productoId,
    publico: cuerpo.publico,
    versionMejor: cuerpo.versionMejor,
    angulo: cuerpo.angulo,
    ofertaId: cuerpo.ofertaId,
    notas: cuerpo.notas,
  });
  return Response.json({ brief, puerta: await puedePedirGuion(brief.proyectoId) });
});

/** Quita el brief. El proyecto, su guion y lo generado se quedan: vuelve a ser un proyecto sin brief. */
export const DELETE = manejador(async (_: Request, contexto: ContextoId, actor) => {
  await exigirRitmoDeEscritura(actor);
  await borrarBrief(actor, await leerId(contexto));
  return Response.json({ borrado: true });
});
