/** Rechazo de presets y plantillas con su código HTTP y un mensaje apto para mostrar tal cual. */
export class ErrorPreset extends Error {
  constructor(
    readonly estado: number,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "ErrorPreset";
  }
}
