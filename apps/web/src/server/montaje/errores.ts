/** Fallo de una operación de montaje o de exportación, con su código HTTP y un mensaje apto para mostrar. */
export class ErrorMontaje extends Error {
  constructor(
    readonly estado: number,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "ErrorMontaje";
  }
}
