/** Fallo de una operación con lugares, con su código HTTP y un mensaje apto para mostrar. */
export class ErrorLugar extends Error {
  constructor(
    readonly estado: number,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "ErrorLugar";
  }
}
