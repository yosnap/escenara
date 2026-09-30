import type { PlantillaVista } from "@/lib/presets";
import { type CategoriaDecidible, categoriasDecididasDe, duracionesDe, textoDeDuraciones } from "@/lib/trends";
import { leerAjustes } from "../ajustes";
import type { FilaPlantilla } from "../db/esquema";
import { listarPlantillas } from "./consulta";
import { ErrorPreset } from "./errores";

/** Lo único que ve el navegador de una plantilla de trend. */
export function vistaPublicaTrend(p: PlantillaVista) {
  return {
    id: p.id,
    nombre: p.nombre,
    descripcion: p.descripcion,
    versionId: p.versionId,
    variables: p.variables,
    duracionesAdmitidas: p.duracionesAdmitidas,
    direccionDecidida: p.direccionDecidida,
    permiteHabla: p.trendAllowsSpeech,
    vistaPrevia: {
      resumen: p.descripcion,
      duracion:
        p.duracionesAdmitidas.length === 0
          ? "Cualquier duración: la del modelo o la del proyecto"
          : `Solo clips de ${textoDeDuraciones(p.duracionesAdmitidas)}`,
      habla: p.trendAllowsSpeech ? "Puede incluir diálogo" : "Sin diálogo a cámara",
      campos: p.variables.map((v) => ({ nombre: v.nombre, etiqueta: v.etiqueta, obligatoria: v.obligatoria })),
    },
  };
}

/** Segundos que admite un trend según su fila. Vacía = cualquier duración. */
export const duracionesDelTrend = (plantilla: FilaPlantilla): number[] =>
  plantilla.kind === "trend" ? duracionesDe(plantilla.allowedSeconds) : [];

/** Categorías de la dirección que decide un trend según su fila. */
export const decididasDelTrend = (plantilla: FilaPlantilla): CategoriaDecidible[] =>
  plantilla.kind === "trend" ? categoriasDecididasDe(plantilla.decidedDirection) : [];

/** Busca una copia vigente, incluso si la original fue duplicada más de una vez. */
export async function alternativaTrendVigente(plantillaId: string): Promise<PlantillaVista | null> {
  const todas = await listarPlantillas();
  const descendientes = new Set([plantillaId]);
  for (let i = 0; i < todas.length; i++) {
    for (const candidata of todas)
      if (candidata.duplicadaDe && descendientes.has(candidata.duplicadaDe)) descendientes.add(candidata.id);
  }
  return (
    todas.find(
      (p) =>
        p.id !== plantillaId &&
        descendientes.has(p.id) &&
        p.kind === "trend" &&
        p.activa &&
        p.trendStatus === "vigente",
    ) ?? null
  );
}

/** Mensaje apto para el usuario: nunca incluye texto inglés ni URL de referencia. */
export async function motivoTrendNoDisponible(plantilla: FilaPlantilla): Promise<string> {
  if (!(await leerAjustes()).trendsVisibles)
    return "Los trends están ocultos en los ajustes de la instalación. Pide a quien administra que los active.";
  if (plantilla.trendStatus === "caducada") {
    const equivalente = await alternativaTrendVigente(plantilla.id);
    return equivalente
      ? `El trend «${plantilla.name}» ha caducado y ya no puede generar. Elige la versión vigente «${equivalente.nombre}» y confirma su coste.`
      : `El trend «${plantilla.name}» ha caducado y ya no puede generar. Pide a quien administra que publique una copia vigente.`;
  }
  if (plantilla.trendStatus === "revision")
    return `El trend «${plantilla.name}» está en revisión y todavía no se puede generar.`;
  return `El trend «${plantilla.name}» está desactivado por la administración.`;
}

export async function exigirTrendVigente(plantilla: FilaPlantilla): Promise<void> {
  if (plantilla.kind !== "trend") throw new ErrorPreset(400, "Esta plantilla no es un trend.");
  if (plantilla.ownerId !== null) throw new ErrorPreset(404, "Ese trend no existe en la instalación.");
  const ajustes = await leerAjustes();
  if (!plantilla.active || !ajustes.trendsVisibles || plantilla.trendStatus !== "vigente") {
    throw new ErrorPreset(409, await motivoTrendNoDisponible(plantilla));
  }
}
