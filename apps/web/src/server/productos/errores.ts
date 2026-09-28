/** Fallo de una operación con productos, con su código HTTP y un mensaje apto para mostrar. */
export class ErrorProducto extends Error {
  constructor(
    readonly estado: number,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "ErrorProducto";
  }
}
