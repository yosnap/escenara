import { obtenerPersonaje } from "@/server/personajes/consulta";
import { type ContextoId, leerCuerpo, leerId, manejador } from "@/server/personajes/http";
import {
  descartarRetratos,
  elegirRetrato,
  generarRetratosCandidatos,
  mediosDeCandidatos,
} from "@/server/personajes/inventado";

export const dynamic = "force-dynamic";

/** Retratos candidatos ya generados de un personaje inventado, para poder elegir entre ellos. */
export const GET = manejador(async (_: Request, contexto: ContextoId, actor) => {
  const id = await leerId(contexto);
  // Que el personaje sea tuyo lo comprueba la ficha; sin eso, esto respondería con medios de otra cuenta.
  await obtenerPersonaje(actor, id);
  return Response.json({ candidatos: await mediosDeCandidatos(actor, id) });
});

/**
 * Genera de uno a cuatro retratos candidatos a partir de la descripción del personaje inventado, o elige uno de los
 * ya generados: `{ accion: "generar" | "elegir", ... }`.
 *
 * Generar **cuesta**: cada candidato es un fotograma con su estimación, su confirmación y su reserva, igual que
 * cualquier otro envío. Elegir no cuesta nada: solo dice cuál de los que ya están pagados es la cara.
 */
export const POST = manejador(async (peticion: Request, contexto: ContextoId, actor) => {
  const id = await leerId(contexto);
  const cuerpo = await leerCuerpo(peticion);
  if (cuerpo.accion === "descartar") {
    return Response.json(await descartarRetratos(actor, id));
  }
  if (cuerpo.accion === "elegir") {
    return Response.json(await elegirRetrato(actor, id, cuerpo.medioId));
  }
  const { trabajos, aviso } = await generarRetratosCandidatos(actor, id, {
    creditosConfirmados: Number(cuerpo.creditosConfirmados),
    derechos: cuerpo.derechos === true,
    claveIdempotencia: String(cuerpo.claveIdempotencia ?? ""),
    ...(cuerpo.cantidad === undefined ? {} : { cantidad: Number(cuerpo.cantidad) }),
    ...(typeof cuerpo.selloEstimacion === "string" ? { selloEstimacion: cuerpo.selloEstimacion } : {}),
    ...(typeof cuerpo.modelo === "string" ? { modelo: cuerpo.modelo } : {}),
    ...(cuerpo.avisoUmbralAceptado === true ? { avisoUmbralAceptado: true } : {}),
    ...(Array.isArray(cuerpo.avisosConfirmados)
      ? { avisosConfirmados: cuerpo.avisosConfirmados.filter((c): c is string => typeof c === "string") }
      : {}),
  });
  return Response.json({ trabajos, aviso }, { status: 201 });
});
