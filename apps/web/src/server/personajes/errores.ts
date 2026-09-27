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
