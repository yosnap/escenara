/** Error de «Tus datos» (exportación, borrados y cuenta) con su código HTTP y un mensaje apto para mostrar. */
export class ErrorDatos extends Error {
  constructor(
    readonly estado: number,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "ErrorDatos";
  }
}
