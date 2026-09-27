/** Fallo de proyectos, escenas o asistente, con su código HTTP y un mensaje apto para mostrar. */
export class ErrorProyecto extends Error {
  constructor(
    readonly estado: number,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "ErrorProyecto";
  }
}
