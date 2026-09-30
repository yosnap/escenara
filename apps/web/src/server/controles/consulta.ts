import type { Vista } from "@/lib/captura-personaje";
import { CAPACIDAD_DE_TIPO } from "@/lib/catalogo";
import type { EvaluacionVista } from "@/lib/controles";
import type { TipoTrabajo } from "@/lib/generacion";
import { hechosDeEscena, techoDelProyecto } from "../asistente/plan";
import type { FilaPersonaje } from "../db/esquema";
import { exigirMedioElegido } from "../generacion/comprobaciones";
import { elegirParaTipo } from "../generacion/precios";
import { personajeDeLaCadena } from "../generacion/trabajos";
import type { Actor } from "../media/servicio";
import { referenciasVigentesDe } from "../personajes/consulta";
import { personajePorId } from "../personajes/contexto";
import { personajePropio } from "../personajes/puede-generar";
import { completarModelosSugeridos } from "../productos/modelos-sugeridos";
import { hechosDelProducto, productoParaGenerar } from "../productos/prompt";
import { creditosDelEnvio } from "../prompts/traduccion";
import type { Buscador } from "../proveedores/codigos";
import { conVistaQueCompleta, hechosDelReparto, recopilarHechos } from "./hechos";
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
  /**
   * Producto elegido **sin escena** (pantalla «Crear»): con él, el panel enseña los mismos avisos que dará la
   * puerta al confirmar. Una escena con producto manda sobre este; uno ajeno se ignora, sin decir que existe.
   */
  productoId?: string | null;
  productoAccion?: string | null;
  /** Fotos del producto que se han elegido enviar (solo «Crear»). Vacío = las de por defecto. */
  productoFotos?: string[];
}

export async function evaluarControles(
  actor: Actor,
  peticion: PeticionDeControles,
  buscar: Buscador = fetch,
): Promise<EvaluacionVista> {
  /**
   * Un retrato de personaje inventado se genera **sin imagen de partida** (0.23.4), así que se evalúa con el
   * modelo de texto a imagen que se le enviaría de verdad: evaluar con el de edición mediría otro precio.
   */
  const eleccion = await elegirParaTipo(peticion.tipo, peticion.modelo, {
    sinReferencia: peticion.retratoInventado === true,
  });
  const creditos = await creditosDelEnvio(Math.ceil(eleccion.precio.creditos));
  const conEscena = peticion.escenaId ? await hechosDeEscena(actor, peticion.escenaId) : null;
  const { personajeId, personaje } = await personajeDelEnvio(actor, peticion);
  // El techo del proyecto sale **siempre** de la escena ya comprobada como propia: `hechosDeEscena` responde 404
  // para una escena ajena o inexistente, así que `conEscena` es no nulo exactamente cuando llegó `escenaId`.
  // Resolver el proyecto por otro camino sería leer el presupuesto de un proyecto de otra persona.
  const proyecto = conEscena ? await techoDelProyecto(conEscena.escena.projectId) : null;
  /**
   * El producto de la escena (0.26.0), para que el panel enseñe **los mismos avisos** que va a dar la puerta:
   * la identidad que no cabe, las referencias que se quedan fuera y la marca que el filtro puede rechazar.
   * En «Crear» no hay escena: el producto llega en la propia petición (`productoId`), para que el aviso se vea
   * **antes** de confirmar y se pueda confirmar con su casilla, en lugar de toparse con él al pulsar.
   */
  const producto = conEscena
    ? conEscena.escena.productId
      ? await productoParaGenerar(actor.id, conEscena.escena.productId, conEscena.escena.productAction, undefined, {
          ids: conEscena.escena.productPhotoIds,
          estricta: false,
        })
      : null
    : peticion.productoId
      ? await productoParaGenerar(actor.id, peticion.productoId, peticion.productoAccion ?? "", undefined, {
          ids: peticion.productoFotos ?? [],
          estricta: true,
        })
      : null;
  const conProducto = producto
    ? hechosDelProducto(
        producto,
        eleccion.adaptador.referenciasDeGaleria?.(eleccion.modelo) ?? eleccion.modelo.parametros.maximoReferencias,
        personaje ? (await referenciasVigentesDe(personaje.id)).length : 1,
        false,
      )
    : null;
  // Sin esto el aviso «no admite la foto del producto» diría que no hay ningún modelo que la admita: la lista de
  // los que sí la llevan la completa quien avisa, con la misma capacidad con la que luego se envía.
  if (conProducto) {
    await completarModelosSugeridos(
      conProducto.hechos,
      peticion.tipo === "animacion"
        ? CAPACIDAD_DE_TIPO.animacion
        : peticion.retratoInventado === true
          ? "text_to_image"
          : CAPACIDAD_DE_TIPO.fotograma,
    );
  }
  const conReparto = conEscena ? await hechosDelReparto(conEscena.escena) : null;
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
        // El reparto de la escena (0.28.0): es lo que hace que el panel enumere **por su nombre** a cada persona
        // real a la que le falta el consentimiento, y no solo al protagonista del proyecto.
        ...(conReparto ? { reparto: conReparto } : {}),
        primerRetrato: peticion.retratoInventado === true && personaje?.virtual === true,
        vistaSintetica: Boolean(peticion.vistaSintetica),
        ...(conProducto ? { producto: conProducto.hechos } : {}),
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
