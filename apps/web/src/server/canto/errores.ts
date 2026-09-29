/**
 * Error del canto con audio propio (0.29.0), con su código HTTP y un mensaje apto para el usuario.
 *
 * Es una familia propia y no `ErrorProyecto` porque lo que falla aquí es la función de canto —el audio, su
 * declaración de derechos, su duración, el retrato— y no el proyecto: la ruta necesita poder distinguirlos para
 * decir qué hay que arreglar y dónde.
 *
 * Todos sus mensajes siguen la norma de errores visibles: **qué se ha quedado sin hacer, por qué, si se ha
 * cobrado y qué hacer**. Ninguno de los que se lanzan antes de encolar ha llegado al proveedor, así que todos
 * dicen que no se ha cobrado nada.
 */
export class ErrorCanto extends Error {
  constructor(
    readonly estado: number,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "ErrorCanto";
  }
}
