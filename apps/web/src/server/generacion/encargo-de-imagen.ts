/**
 * **Confirmación de una imagen encargada desde una ficha** (una foto de un lugar, una vista de un producto). Es la
 * misma que la de cualquier fotograma: créditos que se vieron, sello de la estimación, modelo, casilla de derechos,
 * aviso de gasto, avisos confirmados y clave de idempotencia. La comprueba `crearFotograma`; la lectura del cuerpo está en `http.ts` (`leerConfirmacionEncargo`).
 */
export interface ConfirmacionEncargo {
  creditosConfirmados: number;
  derechos: boolean;
  claveIdempotencia: string;
  selloEstimacion?: string;
  modelo?: string;
  avisoUmbralAceptado?: boolean;
  avisosConfirmados?: string[];
}

/** Lo que de la confirmación viaja a `crearFotograma`, sin los campos que no llegaron. */
export const confirmacionDelFotograma = (c: ConfirmacionEncargo) => ({
  derechos: c.derechos,
  creditosConfirmados: c.creditosConfirmados,
  ...(c.selloEstimacion === undefined ? {} : { selloEstimacion: c.selloEstimacion }),
  ...(c.modelo === undefined ? {} : { modelo: c.modelo }),
  ...(c.avisoUmbralAceptado === undefined ? {} : { avisoUmbralAceptado: c.avisoUmbralAceptado }),
  ...(c.avisosConfirmados === undefined ? {} : { avisosConfirmados: c.avisosConfirmados }),
});
