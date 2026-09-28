import { detalleDeTiempo, type IntentoProveedor, mensajeDeFalloDeProveedor } from "@/lib/diagnostico-proveedor";
import type { TipoDeMapa } from "@/lib/mapa-modelos";
import { cerrarGastoDeEjecucion, reservarEjecucion } from "../asistente/gasto";
import { marcarCompatibleInvalido } from "../boveda/compatibles";
import { db } from "../db/cliente";
import { assistantRuns, type FilaEjecucionAsistente, usageLedger } from "../db/esquema";
import { elegirModelo } from "../proveedores/catalogo";
import type { Buscador } from "../proveedores/codigos";
import { pedirChat } from "../proveedores/compatible/cliente";
import { ErrorCatalogo } from "../proveedores/contrato";
import { MS_TEXTO } from "../proveedores/kie/texto";
import { adaptadorDe } from "../proveedores/registro";
import { type EntradaResuelta, resolverMapa } from "./mapa";
import { clasificarFallo, recorrerMapa } from "./recorrido";

/**
 * Pedir un texto **recorriendo el mapa de modelos** (0.21.1). Lo usan la traducción de prompts y el asistente de
 * guion, que antes elegían cada uno por su cuenta el modelo predeterminado del catálogo.
 *
 * Cada entrada paga en **su** moneda y con **su** apunte:
 *
 * - una entrada de pago (un modelo del catálogo con precio registrado) reserva sus créditos antes de llamar y
 *   los cierra con la regla de lista blanca de siempre;
 * - una entrada de un servicio compatible con la API de OpenAI se cobra por cuota del plan, así que su apunte es
 *   de **0 créditos** y lo que se guarda son los tokens que informa.
 *
 * Nunca se suman ni se comparan créditos de dos proveedores: cada apunte es el de quien cobró.
 */

export const TIPO_TEXTO: TipoDeMapa = "texto";

export interface PeticionDeTexto {
  usuarioId: string;
  proyectoId?: string | null;
  kind: FilaEjecucionAsistente["kind"];
  instrucciones: string;
  entrada: string;
  /** Base de la clave de idempotencia; cada entrada del mapa usa la suya, derivada de esta. */
  claveIdempotencia: string;
  buscar?: Buscador;
}

export interface TextoDelMapa {
  texto: string;
  /** Con quién se ha escrito de verdad, que no tiene por qué ser la entrada principal. */
  nombreProveedor: string;
  modelo: string;
  /** `true` si no fue la entrada principal: quien paga tiene derecho a saber que se cambió. */
  deReserva: boolean;
  intentos: IntentoProveedor[];
}

/**
 * La misma confirmación ya se había ejecutado. No es un fallo de nadie: es la clave de idempotencia haciendo su
 * trabajo, y por eso ni se cuenta como intento ni pasa a la siguiente entrada del mapa.
 */
export class ErrorPeticionRepetida extends Error {
  constructor() {
    super("Esta misma petición ya se está ejecutando.");
    this.name = "ErrorPeticionRepetida";
  }
}

export class ErrorDeTexto extends Error {
  constructor(
    readonly intentos: IntentoProveedor[],
    readonly hayEntradas: boolean,
  ) {
    super("No ha habido ninguna entrada del mapa que pudiera escribir el texto.");
    this.name = "ErrorDeTexto";
  }

  /** Mensaje completo, con todas las entradas probadas y su causa concreta. */
  mensaje(encabezado: string): string {
    if (!this.hayEntradas) {
      return `${encabezado}: tu mapa de modelos de texto no tiene ninguna entrada utilizable. Revísalo en «Tu cuenta»: puede que falte la clave del proveedor que elegiste.`;
    }
    return mensajeDeFalloDeProveedor(encabezado, this.intentos, sugerenciaDeMapa(this.intentos));
  }
}

/** Qué puede hacer quien lo lee cuando se han agotado todas las entradas de su mapa. */
function sugerenciaDeMapa(intentos: readonly IntentoProveedor[]): string {
  return intentos.length <= 1
    ? "Puedes añadir otra entrada de reserva a tu mapa de modelos de texto en «Tu cuenta» y el siguiente intento la probará sola."
    : "";
}

/** Pide el texto recorriendo el mapa. Lanza `ErrorDeTexto` con todos los intentos si ninguna entrada puede. */
export async function pedirTextoPorMapa(peticion: PeticionDeTexto): Promise<TextoDelMapa> {
  const entradas = await resolverMapa(peticion.usuarioId, TIPO_TEXTO);
  // `local` no sabe escribir texto: la transcripción es lo único que hoy se hace en la propia máquina.
  const utiles = entradas.filter((e) => e.proveedor !== "local");
  const resultado = await recorrerMapa(
    utiles,
    (entrada, posicion) => intentarEntrada(peticion, entrada, posicion),
    (entrada, error) =>
      error instanceof ErrorPeticionRepetida
        ? null
        : clasificarFallo(entrada, error, entrada.proveedor === "compatible" ? "" : detalleDeTiempo(MS_TEXTO)),
  );
  // Un servicio compatible que ha rechazado la credencial queda marcado como no válido: así la próxima vez ni se
  // intenta, y la pantalla de «Tu cuenta» lo dice en lugar de dejarlo con aspecto de estar bien.
  for (const id of resultado.saltados) await marcarCompatibleInvalido(id, "rechazada");
  if (!resultado.ok) throw new ErrorDeTexto(resultado.intentos, utiles.length > 0);
  return {
    texto: resultado.valor,
    nombreProveedor: resultado.entrada.nombreProveedor,
    modelo: resultado.entrada.modelo,
    deReserva: resultado.intentos.length > 0,
    intentos: resultado.intentos,
  };
}

async function intentarEntrada(peticion: PeticionDeTexto, entrada: EntradaResuelta, posicion: number): Promise<string> {
  const clave = `${peticion.claveIdempotencia}:${posicion}`;
  return entrada.proveedor === "compatible"
    ? entradaPorCuota(peticion, entrada, clave)
    : entradaDePago(peticion, entrada, clave);
}

/**
 * Entrada de un servicio compatible: se paga por cuota del plan y no por petición, así que **no hay nada que
 * reservar**. Se llama, y si funciona se apunta 0 créditos con los tokens informados.
 */
async function entradaPorCuota(
  peticion: PeticionDeTexto,
  entrada: EntradaResuelta,
  claveIdempotencia: string,
): Promise<string> {
  const servicio = entrada.compatible;
  if (!servicio) throw new ErrorCatalogo(503, "Esa entrada del mapa apunta a un servicio que ya no existe.");
  const respuesta = await pedirChat({
    urlBase: servicio.urlBase,
    clave: servicio.clave,
    modelo: entrada.modelo,
    instrucciones: peticion.instrucciones,
    entrada: peticion.entrada,
    buscar: peticion.buscar,
  });
  await apuntarPorCuota(peticion, entrada, claveIdempotencia, respuesta.tokensEntrada, respuesta.tokensSalida);
  return respuesta.texto;
}

/**
 * Entrada de pago: un modelo del catálogo con precio registrado. Reserva antes de llamar y cierra con la regla
 * de lista blanca, que es la que impide los dobles cobros y **no se toca**.
 */
async function entradaDePago(
  peticion: PeticionDeTexto,
  entrada: EntradaResuelta,
  claveIdempotencia: string,
): Promise<string> {
  const modelo = await elegirModelo("text_generation", entrada.modelo);
  const adaptador = adaptadorDe(modelo.proveedor);
  const generarTexto = adaptador.generarTexto;
  if (!generarTexto) {
    throw new ErrorCatalogo(503, `El adaptador de ${modelo.nombreProveedor} todavía no sabe pedir texto.`);
  }
  const precio = await adaptador.estimar(modelo.modelo);
  const creditos = Math.ceil(precio.creditos);
  const { ejecucion, nueva } = await reservarEjecucion({
    usuarioId: peticion.usuarioId,
    proyectoId: peticion.proyectoId ?? null,
    kind: peticion.kind,
    proveedor: entrada.proveedor,
    modelo: modelo.modelo,
    claveIdempotencia,
    creditos,
    sello: precio.sello,
  });
  // Esta confirmación ya se había ejecutado: no se vuelve a llamar. Quien llama ya sabe qué hacer con eso, y el
  // recorrido no la trata como un fallo del proveedor: no dice nada de si alguien cobró.
  if (!nueva) throw new ErrorPeticionRepetida();

  let respuesta: { texto: string; creditos: number | null };
  try {
    respuesta = await generarTexto({
      clave: entrada.clave,
      modelo: modelo.modelo,
      instrucciones: peticion.instrucciones,
      entrada: peticion.entrada,
      buscar: peticion.buscar ?? fetch,
    });
  } catch (error) {
    await cerrarGastoDeEjecucion(
      ejecucion.id,
      esRechazoProbado(error) ? 0 : null,
      esRechazoProbado(error)
        ? "El proveedor rechazó la petición sin ejecutarla."
        : "El proveedor no confirmó el resultado.",
      "fallido",
      0,
      (error as Error).message,
    );
    throw error;
  }
  await cerrarGastoDeEjecucion(ejecucion.id, respuesta.creditos, "Llamada al modelo de texto.", "listo");
  return respuesta.texto;
}

const esRechazoProbado = (error: unknown) => Boolean((error as { rechazoProbado?: boolean } | null)?.rechazoProbado);

/** Apunta una llamada que no cuesta créditos, con sus tokens. Perder el apunte no puede tirar el trabajo. */
async function apuntarPorCuota(
  peticion: PeticionDeTexto,
  entrada: EntradaResuelta,
  claveIdempotencia: string,
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
          providerName: entrada.nombreProveedor,
          model: entrada.modelo,
          idempotencyKey: claveIdempotencia,
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
        providerName: entrada.nombreProveedor,
        model: entrada.modelo,
        entryType: "consumo",
        credits: 0,
        amountEur: 0,
        informed: true,
        note: `Llamada de texto en ${entrada.nombreProveedor}. Este servicio se paga por cuota del plan, no por petición: no cuesta créditos. Tokens: ${tokensEntrada ?? "?"} de entrada y ${tokensSalida ?? "?"} de salida.`,
      });
    });
  } catch (error) {
    console.error(`[mapa] no se ha podido apuntar una llamada de texto por cuota: ${(error as Error).message}`);
  }
}
