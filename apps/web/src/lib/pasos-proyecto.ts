import type { BriefVista } from "./anuncio";
import { faltaDeclaracion } from "./anuncio-pantalla";
import type { PasoDelFlujo } from "./multipaso";
import type { EstadoProyecto } from "./proyectos";

/**
 * Los cuatro pasos de un proyecto (brief → idea → escenas → aprobación) y su estado, deducidos de lo que está
 * **guardado** en el proyecto. No hay columna de progreso: si el proyecto tiene escenas, el paso de escenas está
 * hecho, y así con todos.
 *
 * El brief es opcional, así que nunca bloquea nada. Lo único que depende de otro paso es la aprobación: sin escenas
 * no hay plan que aprobar. Lo demás que impide aprobar (presupuesto, precios, afirmaciones) se ve y se arregla
 * **dentro** del paso de aprobación, que por eso no se bloquea por ello.
 */

export const IDS_PASOS_PROYECTO = ["brief", "idea", "escenas", "aprobacion"] as const;

export interface DatosPasosProyecto {
  /** `false` cuando quien administra ha apagado el brief: en ese paso no hay nada que hacer. */
  briefActivo: boolean;
  brief: BriefVista | null;
  idea: string;
  totalEscenas: number;
  estado: EstadoProyecto;
  /** Cambios sin guardar en «Escenas» (orden pendiente o escenas editadas). */
  escenasSinGuardar?: boolean;
}

export function pasosDelProyecto(d: DatosPasosProyecto): PasoDelFlujo[] {
  const briefCompleto =
    d.brief !== null && d.brief.productoId !== null && d.brief.angulo !== "" && !faltaDeclaracion(d.brief);
  return [
    {
      id: "brief",
      titulo: "El brief del anuncio",
      corto: "Brief",
      estado: !d.briefActivo || briefCompleto ? "hecho" : d.brief !== null ? "en-curso" : "pendiente",
    },
    { id: "idea", titulo: "La idea", corto: "Idea", estado: d.idea.trim() !== "" ? "hecho" : "pendiente" },
    {
      id: "escenas",
      titulo: "El guion, escena a escena",
      corto: "Escenas",
      // Con cambios sin guardar, el guion de la pantalla no es el guardado: todavía no está hecho.
      estado: d.escenasSinGuardar ? "en-curso" : d.totalEscenas > 0 ? "hecho" : "pendiente",
    },
    d.totalEscenas === 0
      ? {
          id: "aprobacion",
          titulo: "El plan y su coste",
          corto: "Aprobación",
          estado: "bloqueado",
          motivo: "Añade antes al menos una escena al guion: sin escenas no hay plan que aprobar.",
        }
      : {
          id: "aprobacion",
          titulo: "El plan y su coste",
          corto: "Aprobación",
          estado: d.estado === "borrador" ? "pendiente" : "hecho",
        },
  ];
}

/**
 * Paso con el que se abre un proyecto sin `?paso=`: donde está el trabajo. Con el plan aprobado, la aprobación; con
 * escenas, las escenas; con idea, la idea; y si no hay nada, el brief (o la idea, si el brief está apagado).
 */
export function pasoPredeterminadoDelProyecto(d: DatosPasosProyecto): string {
  if (d.estado !== "borrador") return "aprobacion";
  if (d.totalEscenas > 0) return "escenas";
  if (d.idea.trim() !== "" || !d.briefActivo) return "idea";
  return "brief";
}
