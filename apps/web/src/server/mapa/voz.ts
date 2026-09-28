import { creditosDeVoz, type FamiliaDeVoz, familiaDeModeloDeVoz } from "@/lib/voz";
import type { EleccionDeTrabajo } from "../generacion/precios";
import { elegirModelo } from "../proveedores/catalogo";
import { ErrorCatalogo } from "../proveedores/contrato";
import { adaptadorDe } from "../proveedores/registro";
import { type EntradaResuelta, resolverMapa } from "./mapa";

/**
 * Con quién se genera la voz, **según el mapa de modelos del usuario** (0.21.1). Sustituye a la pareja fija
 * «ElevenLabs vía KIE → ElevenLabs directo» de la 0.21.0: ahora son N opciones en el orden que el usuario haya
 * puesto, y la regla de dinero es la misma de siempre.
 *
 * Dos cosas que aquí no se pueden mezclar nunca:
 *
 * 1. **los créditos de dos proveedores**, que no son la misma unidad. Cada opción trae su coste **en su moneda**
 *    y el usuario confirma el de la principal; una reserva solo se usa si cabe en lo que él autorizó para ella;
 * 2. **las familias de voces**: los identificadores de ElevenLabs y los de kokoro no son los mismos, así que una
 *    opción de otra familia **no puede leer** la voz fijada en el proyecto. No se cambia el timbre por su cuenta:
 *    esa opción no aplica y el mensaje lo dice.
 */

/** Una opción de voz ya resuelta, con lo que cuesta este diálogo concreto en la moneda de su proveedor. */
export interface OpcionDeVoz {
  entrada: EntradaResuelta;
  eleccion: EleccionDeTrabajo;
  /** Créditos **de ese proveedor** para este diálogo. 0 en los que se pagan por cuota del plan. */
  creditos: number;
  familia: FamiliaDeVoz;
  /** Dirección del servicio cuando es un compatible con la API de OpenAI; vacía en los demás. */
  urlBase: string;
}

export interface EleccionDeVozDelMapa {
  /** Con quién se intenta primero: la entrada principal del mapa que se puede usar. */
  elegida: OpcionDeVoz;
  /** Las siguientes, en orden. Se prueban solas cuando la anterior falla **sin haber cobrado**. */
  reservas: OpcionDeVoz[];
}

/** Créditos de una opción para un texto concreto, con su tarifa por carácter si la tiene. */
export const creditosDeLaOpcion = (opcion: EleccionDeTrabajo, dialogo: string): number =>
  creditosDeVoz(opcion.modelo.modelo, opcion.precio.creditos, dialogo);

/**
 * Opciones de voz utilizables para este usuario, en el orden de su mapa. Una entrada cuyo modelo ya no está en
 * el catálogo, cuyo adaptador no sabe generar voz o cuyo proveedor no tiene precio registrado **se salta**: no se
 * estima lo que no se sabe cuánto cuesta.
 */
export async function opcionesDeVoz(usuarioId: string, dialogo = ""): Promise<OpcionDeVoz[]> {
  const entradas = await resolverMapa(usuarioId, "voz");
  const opciones: OpcionDeVoz[] = [];
  for (const entrada of entradas) {
    if (entrada.proveedor === "local") continue;
    try {
      const modelo = await elegirModelo("tts", entrada.modelo);
      const adaptador = adaptadorDe(modelo.proveedor);
      if (!adaptador.admite("tts") || !adaptador.generarVoz) continue;
      const eleccion: EleccionDeTrabajo = { modelo, adaptador, precio: await adaptador.estimar(modelo.modelo) };
      opciones.push({
        entrada,
        eleccion,
        creditos: creditosDeLaOpcion(eleccion, dialogo),
        familia: familiaDeModeloDeVoz(modelo.modelo),
        urlBase: entrada.compatible?.urlBase ?? "",
      });
    } catch (error) {
      // Un modelo retirado o sin precio no puede ser una opción: se salta y las demás siguen valiendo.
      if (error instanceof ErrorCatalogo) continue;
      throw error;
    }
  }
  return opciones;
}

/**
 * Elección de voz de este usuario para `dialogo`. `familiaExigida` acota a las opciones que **pueden leer la voz
 * ya fijada** en el proyecto; sin ella (un proyecto que todavía no ha elegido voz) valen todas.
 *
 * Lanza con el motivo concreto cuando no hay ninguna: sin modelo con precio, sin credencial o sin ninguna opción
 * de la familia de la voz elegida, no se estima y no se gasta.
 */
export async function eleccionDeVozDelMapa(
  usuarioId: string,
  dialogo = "",
  familiaExigida: FamiliaDeVoz | null = null,
): Promise<EleccionDeVozDelMapa> {
  const todas = await opcionesDeVoz(usuarioId, dialogo);
  const utiles = familiaExigida === null ? todas : todas.filter((o) => o.familia === familiaExigida);
  const [elegida, ...reservas] = utiles;
  if (!elegida) {
    throw new ErrorCatalogo(
      503,
      todas.length > 0 && familiaExigida !== null
        ? "La voz que tiene fijada este proyecto no existe en ninguna de las opciones de tu mapa de voz. Elige otra voz del proyecto, o añade a tu mapa una opción que sí la tenga."
        : "Tu mapa de voz no tiene ninguna opción utilizable: o el modelo no tiene precio registrado en esta instalación, o te falta la clave de su proveedor. Revísalo en «Tu cuenta».",
    );
  }
  return { elegida, reservas };
}

/** Lo que se guarda en el trabajo de cada reserva autorizada: a dónde puede ir el relevo y con qué tope. */
export interface ReservaAutorizada {
  proveedor: string;
  compatibleId: string | null;
  modelo: string;
  /** Tope en la moneda **de ese proveedor**, que es el que el usuario vio al confirmar. */
  creditos: number;
  familia: FamiliaDeVoz;
  urlBase: string;
}

export const aReservaAutorizada = (opcion: OpcionDeVoz): ReservaAutorizada => ({
  proveedor: opcion.eleccion.modelo.proveedor,
  compatibleId: opcion.entrada.compatibleId,
  modelo: opcion.eleccion.modelo.modelo,
  creditos: opcion.creditos,
  familia: opcion.familia,
  urlBase: opcion.urlBase,
});
