/**
 * Fallo de un registro o de una escena hablada de Omni (0.22.0), con su código HTTP y un mensaje ya apto para
 * mostrar. Clase propia y no `ErrorProyecto` porque este camino lo cruzan las dos mitades —el proyecto, que
 * registra la voz, y el personaje, que registra su cara— y ninguna de las dos es dueña de la otra.
 */
export class ErrorOmni extends Error {
  constructor(
    readonly estado: number,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "ErrorOmni";
  }
}
