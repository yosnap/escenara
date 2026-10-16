import { esIdentificadorDeModelo } from "@/lib/catalogo";
import { imagenPropia } from "@/server/generacion/comprobaciones";
import { ErrorGeneracion } from "@/server/generacion/errores";
import { exigirMismoOrigen, exigirRitmoDeConsultas, leerCuerpo, manejador } from "@/server/generacion/http";
import { esEdicionConLugar, prepararReferenciasTemporales } from "@/server/generacion/referencias-temporales";
import { entradaDelLugar, lugarDelEnvio } from "@/server/lugares/en-el-envio";
import { leerLugarElegido } from "@/server/lugares/para-generar";
import { eleccionDeGeneracion } from "@/server/mapa/generacion";
import { contextoAplicado } from "@/server/personajes/contexto";
import { personajePropio, referenciasParaGenerar } from "@/server/personajes/puede-generar";
import { eleccionDeFotosDelTrabajo, productoDelTrabajo } from "@/server/productos/columnas";
import { leerProductoElegido } from "@/server/productos/eleccion";
import { productoParaGenerar } from "@/server/productos/prompt";
import { referenciasDelPersonajeQueViajan, referenciasDeProductoGuardadas } from "@/server/productos/referencias";
import { cupoDeGaleria, hojaEnElEnvio, repartoCompletoDelEnvio } from "@/server/productos/reparto-del-envio";

/** Comprobación sin generación, traducción ni llamadas al proveedor. */
export const POST = manejador(async (peticion: Request, _: unknown, actor) => {
  exigirMismoOrigen(peticion);
  await exigirRitmoDeConsultas(actor, "referencias-temporales");
  const cuerpo = await leerCuerpo(peticion);
  if (!esIdentificadorDeModelo(cuerpo.modelo)) throw new ErrorGeneracion(400, "Elige un modelo válido.");
  if (!cuerpo.personajeId && !cuerpo.medioId)
    throw new ErrorGeneracion(400, "Elige el personaje o la imagen de partida.");
  const { elegida } = await eleccionDeGeneracion(actor.id, "fotograma", cuerpo.modelo);
  const { modelo, adaptador } = elegida.eleccion;
  const personaje = cuerpo.personajeId ? await personajePropio(actor, cuerpo.personajeId) : null;
  const lugarBase = esEdicionConLugar(cuerpo.referenciasTemporales);
  const conHoja = !lugarBase && personaje !== null && hojaEnElEnvio(personaje);
  const referencias = personaje
    ? (await referenciasParaGenerar(personaje, modelo.parametros.maximoReferencias, conHoja, lugarBase)).referencias
    : [await imagenPropia(actor.id, cuerpo.medioId)];
  const elegido = leerProductoElegido(cuerpo.producto) ?? undefined;
  const columnas = await productoDelTrabajo(actor.id, null, elegido);
  const producto = await productoParaGenerar(
    actor.id,
    columnas.productId,
    columnas.productAction,
    {},
    await eleccionDeFotosDelTrabajo(null, elegido),
  );
  const conLugar = await lugarDelEnvio(actor.id, null, leerLugarElegido(cuerpo.lugar), personaje);
  const { conProducto, reparto } = await repartoCompletoDelEnvio({
    envio: { tipo: "fotograma", personaje, sinReferencia: false, conHoja },
    modelo,
    adaptador,
    producto,
    conLugar,
  });
  const identidad = referenciasDelPersonajeQueViajan(referencias, reparto);
  const otras =
    identidad.length +
    (referenciasDeProductoGuardadas(producto, conProducto).referenciasProducto?.length ?? 0) +
    (entradaDelLugar(conLugar, reparto).referenciasLugar?.length ?? 0);
  const temporales = await prepararReferenciasTemporales(
    actor.id,
    cuerpo.referenciasTemporales,
    "",
    modelo,
    adaptador,
    otras,
  );
  const contexto = personaje && lugarBase ? await contextoAplicado(actor, personaje.id, cuerpo.modelo, true) : null;
  if (contexto) {
    const ids = new Set(identidad.map((r) => r.id));
    contexto.referencias = contexto.referencias.filter((r) => ids.has(r.medioId));
  }
  return Response.json({
    total: otras + temporales.referencias.length,
    maximo: Math.min(modelo.parametros.maximoReferencias, cupoDeGaleria(adaptador, modelo)),
    ...(contexto ? { contexto } : {}),
  });
});
