import { combinaLugarConIdentidad } from "@/lib/continuidad";
import type { Ajustes } from "./ajustes";

/**
 * Ajustes de las escenas habladas con lugar, ya decididos en un solo sitio.
 *
 * El fotograma situado viaja junto a la identidad registrada con el ajuste experimental general (cualquier
 * fotograma aprobado de la escena) o con el de los vídeos completos, que solo vale cuando ese fotograma es un
 * **plano base** del proyecto. Los dos nacen apagados: la voz con imagen combinada está pendiente de escucharse.
 */
export const combinarLugarConIdentidad = (
  ajustes: Pick<Ajustes, "omniLugarCombinado" | "omniLugarCombinadoVideoCompleto">,
  esPlanoBase: boolean,
): boolean =>
  combinaLugarConIdentidad({
    ajusteGeneral: ajustes.omniLugarCombinado,
    ajusteVideoCompleto: ajustes.omniLugarCombinadoVideoCompleto,
    esPlanoBase,
  });
