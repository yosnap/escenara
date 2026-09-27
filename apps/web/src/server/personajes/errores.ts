import { ACCION_MOTIVO, ETIQUETA_MOTIVO, type RechazoDeReferencia } from "@/lib/captura-personaje";

/** Fallo de una operación con personajes, con su código HTTP y un mensaje apto para mostrar. */
export class ErrorPersonaje extends Error {
  constructor(
    readonly estado: number,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "ErrorPersonaje";
  }
}

/**
 * Un medio que se quiere borrar para siempre está en uso como referencia de algún personaje. Lleva la lista
 * de personajes para poder enumerarlos antes de confirmar: borrar la foto sin avisar puede dejar un
 * personaje por debajo del mínimo de referencias y sin poder generar.
 */
export class ErrorMedioEnUso extends ErrorPersonaje {
  constructor(readonly personajes: { id: string; nombre: string }[]) {
    super(
      409,
      `Esta foto se usa como referencia en ${personajes.length === 1 ? "un personaje" : `${personajes.length} personajes`}: ${personajes
        .map((p) => `«${p.nombre}»`)
        .join(
          ", ",
        )}. Si la borras, ${personajes.length === 1 ? "ese personaje pierde" : "esos personajes pierden"} esa referencia y puede que se quede sin las suficientes para generar.`,
    );
    this.name = "ErrorMedioEnUso";
  }
}

/**
 * Ninguna de las fotos pedidas ha pasado el control de calidad (RF03). Lleva el detalle de cada una, con sus
 * motivos y sus métricas, porque «no se ha podido añadir» sin decir por qué ni qué hacer no sirve de nada.
 *
 * 422 y no 400: la petición está bien formada, lo que no vale es el contenido de la foto.
 */
export class ErrorReferenciaRechazada extends ErrorPersonaje {
  constructor(readonly rechazos: RechazoDeReferencia[]) {
    const motivos = [...new Set(rechazos.flatMap((r) => r.motivos))];
    super(
      422,
      `${
        rechazos.length === 1 ? "Esa foto no sirve como referencia" : "Ninguna de esas fotos sirve como referencia"
      }: ${motivos.map((m) => `${ETIQUETA_MOTIVO[m].toLowerCase()} (${ACCION_MOTIVO[m]})`).join(" ")}`,
    );
    this.name = "ErrorReferenciaRechazada";
  }
}
