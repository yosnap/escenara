import { escenaPropia } from "@/server/asistente/consulta";
import { ErrorProyecto } from "@/server/asistente/errores";
import {
  type ContextoId,
  exigirMismoOrigen,
  exigirRitmoDeEscritura,
  leerCuerpo,
  leerId,
  manejador,
} from "@/server/asistente/http";
import { estadoDeRevision, estadoDeRevisionDeEscena } from "@/server/revision/consulta";
import { revisarAutomaticamente } from "@/server/revision/ejecutar";
import {
  accionHumana,
  esAccionPantalla,
  leerConfirmacionMultimodal,
  leerEscenaId,
  leerMotivo,
} from "@/server/revision/entrada";
import { revisarAMano } from "@/server/revision/humana";
import { revisarConModelo } from "@/server/revision/multimodal";

export const dynamic = "force-dynamic";

/**
 * Estado de revisión de continuidad del proyecto (RF07): escena a escena, con su clip, sus referencias, las
 * comprobaciones que ya se hicieron y qué bloquea la exportación. Es **lectura**: no mide nada, no llama a ningún
 * modelo y no aparta presupuesto.
 */
export const GET = manejador(async (_: Request, contexto: ContextoId, actor) =>
  Response.json(await estadoDeRevision(actor, await leerId(contexto))),
);

/**
 * Acciones de revisión de **una** escena del proyecto. Todas devuelven el estado de revisión completo, así que la
 * pantalla nunca muestra algo que ya no sea lo vigente.
 *
 * - `comprobar`: mide el clip con ffprobe y ffmpeg. **No cuesta nada**;
 * - `aceptar`: la escena vale (y retira los críticos que hubiera marcado una persona);
 * - `rechazar`: no vale, con motivo. Avisa, no bloquea;
 * - `marcar-critico`: no vale y **no se exporta** hasta resolverlo, con motivo;
 * - `multimodal`: pide la opinión de un modelo. **Cuesta créditos**, así que exige la confirmación del coste con su
 *   sello y nunca se lanza sola.
 */
export const POST = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  exigirMismoOrigen(peticion);
  const cuerpo = await leerCuerpo(peticion);
  if (!esAccionPantalla(cuerpo.accion)) throw new ErrorProyecto(400, "Esa acción de revisión no existe.");
  await exigirRitmoDeEscritura(actor, `revision:${cuerpo.accion}`);
  const proyectoId = await leerId(contexto);
  const escenaId = leerEscenaId(cuerpo);
  /**
   * Que la escena sea tuya lo comprueba cada servicio otra vez (`escenaPropia` responde 404 para una escena
   * ajena). Aquí se comprueba además que sea **de este proyecto**, y **antes** de tocar nada: una escena propia
   * pedida por la URL de otro proyecto es un error de la petición, no una revisión que haya que guardar.
   */
  const { proyecto } = await escenaPropia(actor, escenaId);
  if (proyecto.id !== proyectoId) throw new ErrorProyecto(404, "Esa escena no existe.");

  if (cuerpo.accion === "comprobar") {
    await revisarAutomaticamente(actor, escenaId);
  } else if (cuerpo.accion === "multimodal") {
    await revisarConModelo(actor, escenaId, leerConfirmacionMultimodal(cuerpo));
  } else {
    const accion = accionHumana(cuerpo.accion);
    if (!accion) throw new ErrorProyecto(400, "Esa acción de revisión no existe.");
    await revisarAMano(actor, escenaId, accion, leerMotivo(cuerpo));
  }

  return Response.json(await estadoDeRevisionDeEscena(actor, escenaId));
});
