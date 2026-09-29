import {
  type CantoVista,
  type CosteCantoVista,
  creditosDeCanto,
  type ImpedimentoCanto,
  NOMBRE_MODELO_CANTO,
} from "@/lib/canto";
import { formatoCanta } from "@/lib/direccion";
import { cantoDe, eurosPorCreditoDe, leerAjustes } from "../ajustes";
import { escenaPropia } from "../asistente/consulta";
import { hechosDeEscena } from "../asistente/plan";
import { hechosDePersonajeCitado } from "../controles/hechos";
import { evaluar } from "../controles/motor";
import type { FilaEscena, FilaProyecto } from "../db/esquema";
import { type Actor, aDto } from "../media/servicio";
import { creditosPorSegundoDeTarifa } from "../proveedores/kie/canto";
import { declaracionDe, vistaDeDeclaracion } from "./declaracion";
import { eleccionDeCanto } from "./eleccion";
import { ErrorCanto } from "./errores";
import { estadoDelCanto } from "./hechos";

/**
 * **Lo que la pantalla de una escena de canto necesita saber** (0.29.0): qué audio hay, cuánto dura, si está
 * declarado, si el retrato sirve, cuánto costaría el clip y qué falta para poder pedirlo.
 *
 * Los impedimentos salen del **mismo motor de reglas** que cierra la puerta al encolar, evaluado solo con los
 * hechos del canto. No es una copia de sus condiciones: es la misma función. Eso es lo que impide que la pantalla
 * diga «listo» y el botón responda con un rechazo, que con un botón de pago es el peor de los fallos.
 *
 * Aquí **no se gasta nada**: es lectura. Lo único que tarda es medir el audio, que se hace en la propia máquina.
 */

/** Estado del canto de una escena propia. */
export async function cantoDeLaEscena(actor: Actor, escenaId: unknown): Promise<CantoVista> {
  const { escena, proyecto } = await escenaPropia(actor, escenaId);
  return vistaDelCanto(actor, escena, proyecto);
}

/** La misma vista a partir de una escena ya leída: la usan la ruta y la pantalla de producción. */
export async function vistaDelCanto(actor: Actor, escena: FilaEscena, proyecto: FilaProyecto): Promise<CantoVista> {
  const ajustes = await leerAjustes();
  const { activo, resolucion } = cantoDe(ajustes);
  const estado = await estadoDelCanto(actor, escena, proyecto);
  const [escenaComprobada, personajeComprobado] = await Promise.all([
    hechosDeEscena(actor, escena.id),
    proyecto.mainCharacterId ? hechosDePersonajeCitado(proyecto.mainCharacterId) : Promise.resolve(null),
  ]);
  const esEscenaDeCanto = formatoCanta(escena.clipFormat);
  const declaracion = estado.audio ? await declaracionDe(actor.id, estado.audio.medio.id) : null;
  /**
   * El coste solo se calcula cuando hay con qué: sin audio medido no hay tarifa que leer. Un fallo al leerla —el
   * modelo sin precio para esa duración— se cuenta como **impedimento** y no revienta la pantalla: la pantalla
   * tiene que poder explicar por qué no se puede pedir, y para eso hay que poder cargarla.
   */
  const { coste, impedimentoDelPrecio } = await costeDelCanto(ajustes, estado.audio?.facturados ?? null);
  const evaluacion = evaluar({
    tipo: "animacion",
    parametros: {
      exigirCoberturaVistas: ajustes.controlesExigirCoberturaVistas,
      exigirPrecioFresco: ajustes.controlesExigirPrecioFresco,
      maximoAvisos: ajustes.controlesMaximoAvisos,
    },
    canto: estado.hechos,
    escena: escenaComprobada.hechos,
    ...(personajeComprobado ? { personaje: personajeComprobado } : {}),
  });
  const impedimentos: ImpedimentoCanto[] = evaluacion.frenos
    // Solo los que cierran puerta: un aviso salvable no impide pedir el clip, lo condiciona a confirmarlo.
    .filter((f) => f.gatea && !f.confirmable)
    .map((f) => ({ clave: f.regla, motivo: f.motivo, accion: f.accion }));
  if (impedimentoDelPrecio) impedimentos.push(impedimentoDelPrecio);
  return {
    activo,
    esEscenaDeCanto,
    audio: estado.audio ? aDto(estado.audio.medio, actor) : null,
    duracion: estado.audio?.duracion ?? null,
    segundosFacturados: estado.audio?.facturados ?? null,
    segundosMaximos: estado.segundosMaximos,
    resolucion,
    declaracion: declaracion ? vistaDeDeclaracion(declaracion) : null,
    retrato: {
      medio: estado.retrato.medio ? aDto(estado.retrato.medio, actor) : null,
      vertical: estado.retrato.vertical,
      proporcion: estado.retrato.proporcion,
    },
    coste,
    impedimentos,
    avisos: evaluacion.frenos
      .filter((f) => f.gatea && f.confirmable)
      .map((f) => ({ regla: f.regla, motivo: f.motivo })),
  };
}

/** Coste del clip con la tarifa registrada de esos segundos, o el motivo por el que no se puede calcular. */
async function costeDelCanto(
  ajustes: Awaited<ReturnType<typeof leerAjustes>>,
  segundos: number | null,
): Promise<{ coste: CosteCantoVista | null; impedimentoDelPrecio: ImpedimentoCanto | null }> {
  if (segundos === null) return { coste: null, impedimentoDelPrecio: null };
  try {
    const eleccion = await eleccionDeCanto(segundos);
    const creditos = creditosDeCanto(eleccion.precio.creditos);
    const eurosModelo = creditos * eurosPorCreditoDe(ajustes, eleccion.modelo.proveedor);
    return {
      coste: {
        creditos,
        euros: eurosModelo,
        creditosAConfirmar: creditos,
        creditosTraduccion: 0,
        eurosAConfirmar: eurosModelo,
        unidad: eleccion.precio.unidad,
        sello: eleccion.precio.sello,
        fuente: eleccion.precio.fuente,
        comprobado: eleccion.precio.comprobado,
        /**
         * Si esa tarifa está **publicada** o **medida** lo dice la propia tarifa registrada, no una deducción
         * sobre su texto: hoy todas las del canto son publicadas, y el día que alguien mida una con dinero real
         * esto lo reflejará solo.
         */
        publicado: eleccion.modelo.tarifas.find((t) => t.unidad === eleccion.precio.unidad)?.publicado ?? false,
        nombreModelo: NOMBRE_MODELO_CANTO[eleccion.modeloCanto],
        creditosPorSegundo: creditosPorSegundoDeTarifa(eleccion.precio.creditos, segundos),
      },
      impedimentoDelPrecio: null,
    };
  } catch (error) {
    if (!(error instanceof ErrorCanto)) throw error;
    return {
      coste: null,
      impedimentoDelPrecio: { clave: "canto-sin-precio", motivo: error.message, accion: "" },
    };
  }
}
