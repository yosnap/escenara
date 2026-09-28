import { detalleDeErrorAjeno, type IntentoProveedor } from "@/lib/diagnostico-proveedor";
import { ErrorCompatible } from "../proveedores/compatible/cliente";
import { ErrorProveedor } from "../proveedores/contrato";
import type { EntradaResuelta } from "./mapa";

/**
 * Recorrido del mapa de modelos: se prueba entrada por entrada hasta que una funcione.
 *
 * **La regla de dinero manda sobre el recorrido** (decisión firme del propietario): se pasa a la siguiente
 * entrada **solo cuando se ha probado que la anterior no cobró**. Es la misma lista blanca de siempre
 * (`ErrorProveedor.rechazoProbado`): credencial rechazada, cuenta sin saldo y exceso de ritmo prueban que no hubo
 * tarea; un 5xx, un tiempo agotado, una red caída o una respuesta que no se entiende **no prueban nada** y
 * podrían venir de un trabajo ya aceptado. Seguir en ese caso es arriesgarse a pagar dos veces.
 *
 * La regla tiene **dos excepciones, y las dos por el mismo motivo**: lo que se protege es que nadie pague dos
 * veces por lo mismo, no que nunca se siga intentando.
 *
 * 1. Cuando la entrada que ha fallado **no cobra por petición** sino por cuota del plan (un servicio compatible
 *    con la API de OpenAI), ningún fallo suyo puede dejar un cargo: se sigue siempre.
 * 2. Cuando la **siguiente** entrada no cobra por petición, seguir no puede crear un segundo cargo: como mucho
 *    queda el de la anterior, que ya está apuntado como «no se sabe si cobró». Esto es lo que hace que un tiempo
 *    agotado del modelo de pago no deje el trabajo sin hacer teniendo el usuario una reserva gratuita, que es
 *    justo lo que el propietario pidió (firme, 2026-09-28).
 *
 * Lo que **nunca** pasa: encadenar dos entradas **de pago** cuando no se sabe si la primera cobró. Por eso el
 * recorrido **recuerda** que hubo un cobro dudoso: a partir de ahí solo se prueban entradas gratuitas, aunque
 * entre medias falle una gratuita (pago dudoso → gratuita que falla → pago sería un segundo cargo posible).
 *
 * «Gratuita» es un hecho declarado, no una deducción: un servicio compatible solo se admite si el usuario ha
 * declarado que cobra por cuota de su plan (`openai_providers.quota_billing`), y `local` es la propia máquina.
 *
 * Y un rechazo de credencial (401/403) en un servicio compatible **salta el resto de entradas de ese mismo
 * servicio**: probar sus demás modelos sería repetir el mismo rechazo con cada uno.
 */

export type ResultadoRecorrido<T> = { intentos: IntentoProveedor[]; saltados: string[] } & (
  | { ok: true; valor: T; entrada: EntradaResuelta }
  | { ok: false }
);

/** Cómo se cuenta un fallo y si se puede seguir con la siguiente entrada. */
export interface Clasificacion {
  intento: IntentoProveedor;
  /** `false` cuando no se sabe si se ha cobrado: entonces no se prueba nada más. */
  seguir: boolean;
  /** Identificador del servicio compatible cuyas demás entradas hay que saltar, si procede. */
  saltarCompatible?: string | null;
}

/**
 * Clasifica un fallo según la regla de dinero. `detalleExtra` lo pone quien llama para precisar lo que solo él
 * sabe (por ejemplo, cuántos segundos esperó antes de darse por vencido).
 */
export function clasificarFallo(entrada: EntradaResuelta, error: unknown, detalleExtra = ""): Clasificacion {
  const base = { proveedor: entrada.nombreProveedor, modelo: entrada.modelo };
  if (error instanceof ErrorCompatible) {
    // Se paga por cuota del plan, no por petición: ningún fallo suyo puede dejar un cargo.
    return {
      intento: { ...base, codigo: error.codigo, cobro: "sin-cobro", detalle: error.detalle },
      seguir: true,
      saltarCompatible: error.paraElProveedor ? entrada.compatibleId : null,
    };
  }
  if (error instanceof ErrorProveedor) {
    return {
      intento: {
        ...base,
        codigo: error.codigo,
        cobro: error.rechazoProbado ? "sin-cobro" : "se-desconoce",
        detalle: detalleExtra,
      },
      seguir: error.rechazoProbado,
    };
  }
  // Un fallo nuestro no dice nada del cobro del proveedor: se para, que es lo prudente con el dinero de otro.
  return {
    intento: {
      ...base,
      codigo: "respuesta-inesperada",
      cobro: "se-desconoce",
      detalle: detalleDeErrorAjeno((error as Error)?.message),
    },
    seguir: false,
  };
}

/**
 * Recorre las entradas en orden. `intentar` hace la llamada de verdad y `clasificar` decide cómo se cuenta su
 * fallo; por defecto, con la regla de dinero de arriba.
 */
export async function recorrerMapa<T>(
  entradas: readonly EntradaResuelta[],
  intentar: (entrada: EntradaResuelta, posicion: number) => Promise<T>,
  /**
   * Devolver `null` significa «esto no es un fallo del proveedor»: el error sale tal cual y no se cuenta como
   * intento. Es lo que hace falta para cosas como una petición repetida, que no dice nada de si alguien cobró.
   */
  clasificar: (entrada: EntradaResuelta, error: unknown) => Clasificacion | null = (e, error) =>
    clasificarFallo(e, error),
): Promise<ResultadoRecorrido<T>> {
  const intentos: IntentoProveedor[] = [];
  const saltados = new Set<string>();
  // Una entrada de pago falló sin probar que no cobró: desde aquí solo se prueban entradas gratuitas.
  let cobroDudoso = false;
  for (const [posicion, entrada] of entradas.entries()) {
    if (entrada.compatibleId !== null && saltados.has(entrada.compatibleId)) continue;
    if (cobroDudoso && !esGratuita(entrada)) continue;
    try {
      return { ok: true, valor: await intentar(entrada, posicion), entrada, intentos, saltados: [...saltados] };
    } catch (error) {
      const clasificacion = clasificar(entrada, error);
      if (!clasificacion) throw error;
      const { intento, seguir, saltarCompatible } = clasificacion;
      intentos.push(intento);
      if (saltarCompatible) saltados.add(saltarCompatible);
      if (!seguir) {
        cobroDudoso = true;
        if (!siguienteEsGratuita(entradas, posicion, saltados)) return { ok: false, intentos, saltados: [...saltados] };
      }
    }
  }
  return { ok: false, intentos, saltados: [...saltados] };
}

/** `true` si la siguiente entrada que se probaría no cobra por petición, y por tanto no puede crear otro cargo. */
function siguienteEsGratuita(
  entradas: readonly EntradaResuelta[],
  posicion: number,
  saltados: ReadonlySet<string>,
): boolean {
  for (const entrada of entradas.slice(posicion + 1)) {
    if (entrada.compatibleId !== null && saltados.has(entrada.compatibleId)) continue;
    return esGratuita(entrada);
  }
  return false;
}

/** Entrada que no cobra por petición: un servicio compatible declarado de cuota o la propia máquina. */
const esGratuita = (entrada: EntradaResuelta): boolean =>
  entrada.proveedor === "compatible" || entrada.proveedor === "local";
