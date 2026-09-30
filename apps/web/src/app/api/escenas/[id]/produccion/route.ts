import { ErrorProyecto } from "@/server/asistente/errores";
import {
  type ContextoId,
  exigirMismoOrigen,
  exigirRitmoDeEscritura,
  leerCuerpo,
  leerId,
  manejador,
} from "@/server/asistente/http";
import { cancelarEscena } from "@/server/produccion/cancelar";
import { estadoDeProduccion } from "@/server/produccion/consulta";
import { leerConfirmacion } from "@/server/produccion/entrada";
import {
  aprobarFotograma,
  autorizarReintentos,
  otroClipDeEscena,
  producirEscena,
  regenerarEscena,
  usarFotogramaDeBiblioteca,
} from "@/server/produccion/producir";
import { usarVersionDeEscena } from "@/server/produccion/versiones";

export const dynamic = "force-dynamic";

/**
 * Acciones de producción de **una** escena. Ninguna toca a las demás.
 *
 * - `producir`: encola su fotograma;
 * - `aprobar-fotograma`: da por bueno el fotograma listo y encola su animación (es un gasto, así que se confirma);
 * - `otro-clip`: vuelve a animar el **mismo** fotograma aprobado con la dirección y el texto de ahora, sin tocar
 *   los clips anteriores (0.25.1). Es otro gasto y se confirma como cualquier otro;
 * - `fotograma-de-biblioteca`: toma una imagen del usuario (`medioId`) como fotograma de partida de la escena,
 *   sin generar nada y sin gastar nada (0.25.1);
 * - `regenerar`: encola otro fotograma de esta escena, conservando los anteriores como versiones. Después de un
 *   fallo con coste posible exige presupuesto de reintentos autorizado;
 * - `cancelar`: cancela lo que aún no ha salido y **avisa de lo que se cobrará**;
 * - `reintentos`: autoriza cuántos reintentos de pago más se permiten en esta escena;
 * - `usar-version`: elige otro clip ya generado de la escena (`trabajoId`) de su biblioteca de versiones (0.41.0).
 *   No genera ni borra nada: cambia el clip que entra en el montaje.
 *
 * Las cuatro primeras llevan la confirmación de coste de siempre; `cancelar`, `reintentos` y `usar-version` no
 * gastan nada.
 */
const ACCIONES = [
  "producir",
  "aprobar-fotograma",
  "otro-clip",
  "fotograma-de-biblioteca",
  "regenerar",
  "cancelar",
  "reintentos",
  "usar-version",
] as const;
type Accion = (typeof ACCIONES)[number];

const esAccion = (v: unknown): v is Accion => ACCIONES.includes(v as Accion);

export const POST = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  exigirMismoOrigen(peticion);
  const cuerpo = await leerCuerpo(peticion);
  if (!esAccion(cuerpo.accion)) throw new ErrorProyecto(400, "Esa acción de producción no existe.");
  await exigirRitmoDeEscritura(actor, `produccion:${cuerpo.accion}`);
  const id = await leerId(contexto);

  if (cuerpo.accion === "cancelar") return Response.json(await cancelarEscena(actor, id));
  if (cuerpo.accion === "reintentos") {
    return Response.json(await autorizarReintentos(actor, id, cuerpo.reintentos));
  }
  // Elegir otra versión del clip tampoco: el archivo ya está pagado y guardado.
  if (cuerpo.accion === "usar-version") {
    const proyectoId = await usarVersionDeEscena(actor, id, cuerpo.trabajoId);
    return Response.json(await estadoDeProduccion(actor, proyectoId));
  }
  // Elegir el fotograma de partida no cuesta nada, así que no lleva confirmación de coste.
  if (cuerpo.accion === "fotograma-de-biblioteca") {
    return Response.json(await usarFotogramaDeBiblioteca(actor, id, cuerpo.medioId));
  }
  const confirmacion = leerConfirmacion(cuerpo);
  if (cuerpo.accion === "aprobar-fotograma") {
    return Response.json(await aprobarFotograma(actor, id, confirmacion));
  }
  if (cuerpo.accion === "otro-clip") return Response.json(await otroClipDeEscena(actor, id, confirmacion));
  if (cuerpo.accion === "regenerar") return Response.json(await regenerarEscena(actor, id, confirmacion));
  return Response.json(await producirEscena(actor, id, confirmacion));
});
