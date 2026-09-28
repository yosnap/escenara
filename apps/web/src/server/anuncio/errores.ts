/**
 * Fallo de una operación de la estrategia del anuncio (oferta, brief o declaración), con su código HTTP y un
 * mensaje ya apto para mostrar.
 *
 * Nunca dice «no se ha podido»: el mensaje de cada lanzamiento nombra **qué falta** y **qué hacer** (norma de
 * errores visibles con causa). Lo ajeno responde 404 con el mismo texto que lo inexistente, igual que en
 * productos y en proyectos: distinguirlos sería decirle a alguien que la oferta de otra persona existe.
 */
export class ErrorAnuncio extends Error {
  constructor(
    readonly estado: number,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "ErrorAnuncio";
  }
}
