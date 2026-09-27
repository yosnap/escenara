/** Error de negocio de la generación, con el código HTTP y un mensaje apto para mostrar al usuario. */
export class ErrorGeneracion extends Error {
  constructor(
    readonly estado: number,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "ErrorGeneracion";
  }
}
