import { detalleDeErrorAjeno, type IntentoProveedor } from "@/lib/diagnostico-proveedor";
import { leerAjustes } from "../../ajustes";
import { type CompatibleUtilizable, marcarCompatibleInvalido, usarCompatibles } from "../../boveda/compatibles";
import { db } from "../../db/cliente";
import { assistantRuns, type FilaEjecucionAsistente, usageLedger } from "../../db/esquema";
import type { Buscador } from "../codigos";
import { ErrorCompatible, pedirChat } from "./cliente";

/**
 * **Reserva de la traducción de prompts y del asistente de guion** (decisión firme del propietario, 2026-09-28).
 *
 * Cuando el modelo de texto del catálogo falla —tiempo agotado, 5xx, sin precio, sin credencial— y el usuario
 * tiene servicios compatibles con la API de OpenAI dados de alta, se vuelve a pedir el mismo texto a esos
 * servicios en lugar de dejar el trabajo sin hacer.
 *
 * Reglas del recorrido, comprobadas contra NaN builders el 2026-09-28:
 *
 * - se prueban los proveedores **en su orden**, y dentro de cada uno sus modelos **en el orden que puso el
 *   usuario**: el primero es el preferido;
 * - **429** (límite de peticiones simultáneas), **402** (cuota agotada) y **5xx**, además del tiempo agotado y
 *   la red caída, pasan **al siguiente modelo**: es ese modelo el que no está disponible, no el servicio;
 * - **401 y 403** paran **ese proveedor entero** y lo marcan como no válido: la clave no sirve, y probar sus
 *   demás modelos sería repetir el mismo rechazo con cada uno;
 * - el resultado, salga bien o mal, se cuenta entero en el mensaje: cada proveedor, cada modelo y su causa.
 *
 * **Sin doble cobro.** El gasto del modelo del catálogo lo cierra su propia regla de lista blanca, que no se
 * toca. Lo que se apunta aquí es un apunte **nuevo y de 0 créditos**: estos servicios se cobran por cuota o por
 * plan, no por petición, así que cargarle créditos al usuario sería inventarse un precio. Lo que sí se guarda
 * son los tokens que informa `usage`, que es lo único que mide de verdad cuánta cuota se ha consumido.
 */

export interface PeticionRelevo {
  usuarioId: string;
  /** Proyecto al que pertenece; `null` en las traducciones. */
  proyectoId?: string | null;
  kind: FilaEjecucionAsistente["kind"];
  instrucciones: string;
  entrada: string;
  /**
   * Clave de idempotencia propia de **este** relevo. Va aparte de la del modelo principal: son dos llamadas
   * distintas y cada una tiene su apunte.
   */
  claveIdempotencia: string;
  buscar?: Buscador;
}

export type ResultadoRelevo =
  | { ok: true; texto: string; nombre: string; modelo: string; intentos: IntentoProveedor[] }
  | { ok: false; intentos: IntentoProveedor[]; hayProveedores: boolean };

/**
 * Recorre los servicios compatibles del usuario hasta que uno conteste. `intentos` son **solo los de aquí**:
 * quien llama antepone el intento que ya hizo con el modelo principal, que es lo que convierte el mensaje en
 * «KIE.ai no respondió en 90 s; se probó entonces con…».
 */
export async function relevoDeTexto(peticion: PeticionRelevo): Promise<ResultadoRelevo> {
  const { relevoTextoActivo } = await leerAjustes();
  if (!relevoTextoActivo) return { ok: false, intentos: [], hayProveedores: false };
  const proveedores = await usarCompatibles(peticion.usuarioId);
  if (proveedores.length === 0) return { ok: false, intentos: [], hayProveedores: false };

  const intentos: IntentoProveedor[] = [];
  for (const proveedor of proveedores) {
    const parado = await probarProveedor(proveedor, peticion, intentos);
    if (parado) return parado;
  }
  return { ok: false, intentos, hayProveedores: true };
}

/**
 * Prueba los modelos de un proveedor en orden. Devuelve el resultado cuando hay que dejar de recorrer (ha
 * funcionado), o `null` para pasar al siguiente proveedor.
 */
async function probarProveedor(
  proveedor: CompatibleUtilizable,
  peticion: PeticionRelevo,
  intentos: IntentoProveedor[],
): Promise<ResultadoRelevo | null> {
  for (const modelo of proveedor.modelos) {
    try {
      const respuesta = await pedirChat({
        urlBase: proveedor.urlBase,
        clave: proveedor.clave,
        modelo,
        instrucciones: peticion.instrucciones,
        entrada: peticion.entrada,
        buscar: peticion.buscar,
      });
      await apuntarLlamada(peticion, proveedor, modelo, respuesta.tokensEntrada, respuesta.tokensSalida);
      return { ok: true, texto: respuesta.texto, nombre: proveedor.nombre, modelo, intentos: [...intentos] };
    } catch (error) {
      const fallo = error instanceof ErrorCompatible ? error : null;
      intentos.push({
        proveedor: proveedor.nombre,
        modelo,
        codigo: fallo?.codigo ?? "respuesta-inesperada",
        // Estos servicios cobran por cuota, no por petición: una llamada fallida nunca deja un cargo.
        cobro: "sin-cobro",
        detalle: fallo?.detalle ?? detalleDeErrorAjeno((error as Error)?.message),
      });
      if (fallo?.paraElProveedor) {
        // La clave de este servicio no sirve: se marca y no se prueban sus demás modelos.
        await marcarCompatibleInvalido(proveedor.id, fallo.codigo);
        return null;
      }
    }
  }
  return null;
}

/**
 * Apunta la llamada que sí ha funcionado: una ejecución cerrada con **0 créditos** y su apunte de consumo, más
 * los tokens informados. No reserva nada porque no hay nada que apartar: el precio de estos servicios no se paga
 * por llamada.
 */
async function apuntarLlamada(
  peticion: PeticionRelevo,
  proveedor: CompatibleUtilizable,
  modelo: string,
  tokensEntrada: number | null,
  tokensSalida: number | null,
): Promise<void> {
  try {
    await db().transaction(async (tx) => {
      const [ejecucion] = await tx
        .insert(assistantRuns)
        .values({
          userId: peticion.usuarioId,
          projectId: peticion.proyectoId ?? null,
          kind: peticion.kind,
          provider: "compatible",
          providerName: proveedor.nombre,
          model: modelo,
          idempotencyKey: peticion.claveIdempotencia,
          state: "listo",
          estimatedCredits: 0,
          consumedCredits: 0,
          promptTokens: tokensEntrada,
          completionTokens: tokensSalida,
          finishedAt: new Date(),
        })
        .onConflictDoNothing()
        .returning();
      if (!ejecucion) return;
      await tx.insert(usageLedger).values({
        userId: peticion.usuarioId,
        assistantRunId: ejecucion.id,
        provider: "compatible",
        providerName: proveedor.nombre,
        model: modelo,
        entryType: "consumo",
        credits: 0,
        amountEur: 0,
        informed: true,
        note: `Llamada de texto de reserva en ${proveedor.nombre}. Este servicio se paga por cuota del plan, no por petición: no cuesta créditos. Tokens: ${tokensEntrada ?? "?"} de entrada y ${tokensSalida ?? "?"} de salida.`,
      });
    });
  } catch (error) {
    // El texto ya está y no ha costado créditos: perder su apunte no puede tirar el trabajo del usuario.
    console.error(`[relevo] no se ha podido apuntar la llamada de reserva: ${(error as Error).message}`);
  }
}

/** Aviso para quien no tiene ningún servicio de reserva dado de alta. Es la cuarta parte del mensaje: qué hacer. */
export function sugerenciaDeRelevo(hayProveedores: boolean): string {
  return hayProveedores
    ? ""
    : "Puedes añadir un servicio compatible con la API de OpenAI en «Tu cuenta» y el siguiente intento lo probará solo cuando el modelo principal falle.";
}
