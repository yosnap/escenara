import { esIdentificadorDeModelo } from "@/lib/catalogo";
import { esTipoTrabajo } from "@/lib/generacion";
import { leerDireccionElegida } from "@/server/direccion/eleccion";
import { ErrorGeneracion } from "@/server/generacion/errores";
import { exigirMismoOrigen, leerCuerpo, manejador } from "@/server/generacion/http";
import { crearAnimacion, crearFotograma } from "@/server/generacion/servicio";
import { listarTrabajos } from "@/server/generacion/trabajos";
import { leerProductoElegido } from "@/server/productos/eleccion";
import { leerSeleccionDePresets } from "@/server/prompts/entrada";

export const dynamic = "force-dynamic";

/** Historial de trabajos de quien pregunta, de lo más reciente a lo más antiguo. */
export const GET = manejador(async (_: Request, __: unknown, actor) =>
  Response.json({ trabajos: await listarTrabajos(actor.id) }),
);

/**
 * Crea un trabajo. Nada se envía al proveedor sin `creditosConfirmados` (los créditos que se mostraron),
 * sin `derechos` marcado y sin `claveIdempotencia`, que evita cobrar dos veces la misma confirmación.
 *
 * `modelo` y `selloEstimacion` son opcionales: sin ellos se usa el modelo predeterminado de la capacidad.
 * Con ellos, el modelo tiene que estar en el catálogo y el sello ser el del precio vigente.
 *
 * - fotograma: `{ tipo: "fotograma", medioId | personajeId, prompt, creditosConfirmados, derechos,
 *   claveIdempotencia }`. Con `personajeId` se envían varias referencias del personaje y hace falta además
 *   `sinTerceros` (la revisión de referencias de ADR-0009); el personaje tiene que tener consentimiento
 *   vigente y referencias suficientes, o se rechaza con 409.
 * - animación: `{ tipo: "animacion", trabajoPadreId | medioId, dialogo?, direccion?, … }`. Con `medioId` se
 *   anima una imagen de la biblioteca del usuario sin generar ningún fotograma antes; con `direccion` se dirige
 *   el clip con claves del catálogo (nunca texto de prompt) (`dialogo` es lo que dice el personaje,
 *   que solo se usa en el clip: en el fotograma los modelos lo dibujarían como texto)
 *
 * `avisoUmbralAceptado` es obligatorio cuando la estimación pasa del aviso de Admin › Ajustes, y
 * `versionPersonaje` es la versión de la ficha que se le mostró al confirmar: si la que se usaría es otra, se
 * responde 409 en lugar de generar con una apariencia que el usuario no ha revisado.
 *
 * Con `plantillaId` (0.16.0), el prompt lo **compone el servidor** a partir de `presets` (identificadores por
 * categoría) y de `prompt`, que pasa a ser el valor de la variable de texto. `promptEditado` es el texto final
 * que el usuario editó a mano, si lo editó. Nada de esto puede cambiar modelo, duración ni resolución.
 */
/**
 * Avisos «Necesita ajustes» que el usuario confirma expresamente (0.18.0): claves de regla, nunca texto libre.
 * Se acotan aquí a lo que puede ser una clave de regla; las que no correspondan a un aviso salvable no hacen
 * nada, y un freno `Bloqueado` o `Requiere revisión` no se salta por venir listado (`controles/puerta.ts`).
 */
function leerAvisosConfirmados(valor: unknown): string[] {
  if (valor === undefined) return [];
  if (!Array.isArray(valor) || valor.length > 20) {
    throw new ErrorGeneracion(400, "Los avisos confirmados no son válidos.");
  }
  return valor.map((clave) => {
    if (typeof clave !== "string" || !/^[a-z0-9-]{1,60}$/.test(clave)) {
      throw new ErrorGeneracion(400, "Los avisos confirmados no son válidos.");
    }
    return clave;
  });
}

/** Duración del clip que llega del navegador: entera, en segundos y dentro de lo que dura un clip. */
function leerSegundos(valor: unknown): number {
  if (typeof valor !== "number" || !Number.isInteger(valor) || valor < 1 || valor > 600) {
    throw new ErrorGeneracion(400, "Esa duración no es válida.");
  }
  return valor;
}

export const POST = manejador(async (peticion: Request, _: unknown, actor) => {
  exigirMismoOrigen(peticion);
  const cuerpo = await leerCuerpo(peticion);
  if (!esTipoTrabajo(cuerpo.tipo)) throw new ErrorGeneracion(400, "Tipo de trabajo no válido.");
  if (cuerpo.modelo !== undefined && !esIdentificadorDeModelo(cuerpo.modelo)) {
    throw new ErrorGeneracion(400, "Ese modelo no es válido.");
  }
  const sello = cuerpo.selloEstimacion;
  if (sello !== undefined && (typeof sello !== "string" || sello.length > 200)) {
    throw new ErrorGeneracion(400, "La estimación confirmada no es válida.");
  }
  // Versión de la ficha que se confirmó (0.15.0): si la que se usaría es otra, el servicio responde 409.
  const version = cuerpo.versionPersonaje;
  if (version !== undefined && (typeof version !== "string" || version.length > 40)) {
    throw new ErrorGeneracion(400, "La versión de la ficha confirmada no es válida.");
  }
  const plantilla = leerSeleccionDePresets(cuerpo);
  const direccionElegida = leerDireccionElegida(cuerpo.direccion);
  const productoElegido = leerProductoElegido(cuerpo.producto);
  const comun = {
    avisosConfirmados: leerAvisosConfirmados(cuerpo.avisosConfirmados),
    prompt: String(cuerpo.prompt ?? ""),
    ...plantilla,
    creditosConfirmados: cuerpo.creditosConfirmados as number,
    derechos: cuerpo.derechos === true,
    avisoUmbralAceptado: cuerpo.avisoUmbralAceptado === true,
    claveIdempotencia: cuerpo.claveIdempotencia as string,
    modelo: cuerpo.modelo,
    selloEstimacion: sello,
    versionPersonaje: version,
  };
  const envio =
    cuerpo.tipo === "fotograma"
      ? await crearFotograma(actor, {
          ...comun,
          medioId: cuerpo.medioId as string | undefined,
          personajeId: cuerpo.personajeId as string | undefined,
          sinTerceros: cuerpo.sinTerceros === true,
        })
      : await crearAnimacion(actor, {
          ...comun,
          trabajoPadreId: cuerpo.trabajoPadreId as string | undefined,
          /**
           * Imagen de la biblioteca que se anima directamente (0.25.1), sin generar antes ningún fotograma.
           * Que sea suya lo comprueba el servicio al leerla: una ajena responde 404.
           */
          medioId: cuerpo.medioId as string | undefined,
          // Duración confirmada del clip (0.23.4): cada duración es una tarifa distinta, así que la que llega
          // aquí es la que se estimó y la que se va a pagar. Fuera de un proyecto la elige el usuario.
          ...(cuerpo.segundos === undefined ? {} : { segundos: leerSegundos(cuerpo.segundos) }),
          // Como el resto de los campos: si llega, tiene que ser texto.
          dialogo: cuerpo.dialogo === undefined ? "" : (cuerpo.dialogo as string),
          /**
           * Dirección del clip elegida en «Crear» (0.25.1): claves del catálogo y enumerados, validadas aquí en
           * el borde. El texto en inglés lo compone el servidor con su catálogo, nunca el navegador (ADR-0022).
           */
          ...(direccionElegida ? { direccionElegida } : {}),
          /**
           * Producto elegido en «Crear» (0.26.0): el identificador de un producto suyo y la clave de la acción.
           * Que sea suyo lo comprueba el servicio; aquí solo se valida la forma. De momento se guarda y no
           * cambia el prompt.
           */
          ...(productoElegido ? { productoElegido } : {}),
          // Obligatoria si el fotograma del que sale el clip se hizo con un personaje.
          sinTerceros: cuerpo.sinTerceros === true,
        });
  // 201 cuando el trabajo es nuevo; 200 si esta confirmación ya se había enviado (misma clave).
  return Response.json(envio.trabajo, { status: envio.nueva ? 201 : 200 });
});
