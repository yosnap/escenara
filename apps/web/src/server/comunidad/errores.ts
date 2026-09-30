/** Fallo de una operación de la comunidad, con su código HTTP y un mensaje apto para mostrar (causa y qué hacer). */
export class ErrorComunidad extends Error {
  constructor(
    readonly estado: number,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "ErrorComunidad";
  }
}
