import type { Vista } from "@/lib/captura-personaje";
import type { EvaluacionVista } from "@/lib/controles";
import type { TipoTrabajo } from "@/lib/generacion";
import { hechosDeEscena, techoDelProyecto } from "../asistente/plan";
import type { FilaPersonaje } from "../db/esquema";
import { exigirMedioElegido } from "../generacion/comprobaciones";
import { elegirParaTipo } from "../generacion/precios";
import { personajeDeLaCadena } from "../generacion/trabajos";
import type { Actor } from "../media/servicio";
import { personajePorId } from "../personajes/contexto";
import { personajePropio } from "../personajes/puede-generar";
import { creditosDelEnvio } from "../prompts/traduccion";
import type { Buscador } from "../proveedores/codigos";
import { conVistaQueCompleta, recopilarHechos } from "./hechos";
import { evaluarParaMostrar } from "./puerta";

/**
 * Lectura de los controles previos: **qué diría la puerta si pulsaras ahora**.
 *
 * Es de lectura de verdad: no apunta ningún movimiento de presupuesto, no encola nada, no llama a ningún
 * endpoint de pago del proveedor y **no guarda ninguna evaluación**. Se evalúa con los mismos hechos y el
 * mismo motor que la puerta (`hechos.ts › recopilarHechos`), así que el panel no puede decir «listo» mirando
 * cosas distintas de las que mira quien cobra.
 *
 * Lo que se devuelve son motivos y acciones escritos para el usuario. El prompt no entra en los hechos ni
 * sale de aquí (ADR-0022).
 */

export interface PeticionDeControles {
  tipo: TipoTrabajo;
  /** Modelo del catálogo; sin él, el predeterminado de la capacidad. */
  modelo?: string | null;
  /** Personaje elegido, si se genera con uno. */
  personajeId?: string | null;
  /** Imagen suelta de la biblioteca: puede heredar el personaje del trabajo del que salió. */
  medioId?: string | null;
  /** Escena del plan que se produciría. */
  escenaId?: string | null;
  /** Vista del personaje que se va a generar porque le falta: evalúa como lo hará la puerta de esa vista. */
  vistaSintetica?: Vista | null;
  /**
   * Retrato candidato de un personaje **inventado**: evalúa como lo hará su puerta, que no le exige las fotos que
   * precisamente ese retrato le va a dar. Solo vale si el personaje es inventado; en otro se ignora.
   */
  retratoInventado?: boolean;
}

export async function evaluarControles(
  actor: Actor,
  peticion: PeticionDeControles,
  buscar: Buscador = fetch,
): Promise<EvaluacionVista> {
  const eleccion = await elegirParaTipo(peticion.tipo, peticion.modelo);
  const creditos = await creditosDelEnvio(Math.ceil(eleccion.precio.creditos));
  const conEscena = peticion.escenaId ? await hechosDeEscena(actor, peticion.escenaId) : null;
  const { personajeId, personaje } = await personajeDelEnvio(actor, peticion);
  // El techo del proyecto sale **siempre** de la escena ya comprobada como propia: `hechosDeEscena` responde 404
  // para una escena ajena o inexistente, así que `conEscena` es no nulo exactamente cuando llegó `escenaId`.
  // Resolver el proyecto por otro camino sería leer el presupuesto de un proyecto de otra persona.
  const proyecto = conEscena ? await techoDelProyecto(conEscena.escena.projectId) : null;
  const hechos = conVistaQueCompleta(
    await recopilarHechos(
      actor,
      {
        tipo: peticion.tipo,
        eleccion,
        creditos,
        personajeId,
        personaje,
        escena: conEscena?.hechos ?? null,
        proyecto,
        primerRetrato: peticion.retratoInventado === true && personaje?.virtual === true,
      },
      buscar,
    ),
    personajeId ? peticion.vistaSintetica : null,
  );
  return evaluarParaMostrar(hechos);
}

/**
 * Personaje del envío: el elegido, o el que hereda una imagen suelta que salió de un trabajo con personaje. Se
 * devuelven el identificador **y** la ficha por separado: con identificador y sin ficha, el motor bloquea.
 */
async function personajeDelEnvio(
  actor: Actor,
  peticion: PeticionDeControles,
): Promise<{ personajeId: string | null; personaje: FilaPersonaje | null }> {
  if (peticion.personajeId) {
    return { personajeId: peticion.personajeId, personaje: await personajePropio(actor, peticion.personajeId) };
  }
  if (!peticion.medioId) return { personajeId: null, personaje: null };
  const heredado = await personajeDeLaCadena(actor.id, exigirMedioElegido(peticion.medioId));
  return { personajeId: heredado, personaje: heredado ? await personajePorId(heredado) : null };
}
