/** Error de negocio con el código HTTP y un mensaje apto para mostrar al usuario. */
export class ErrorMedio extends Error {
  constructor(
    readonly estado: number,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "ErrorMedio";
  }
}
