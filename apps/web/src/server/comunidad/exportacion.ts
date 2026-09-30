import type { Actor } from "../media/servicio";
import { misPublicaciones } from "./consulta";
import { logrosDe } from "./logros";

/**
 * Exportación de lo tuyo en la comunidad: tus publicaciones en cualquier estado (con el motivo de un rechazo y sin
 * claves del almacenamiento: los archivos se enlazan por su ruta) y tus logros. Nada de otras cuentas.
 */
export async function exportarMiComunidad(actor: Actor) {
  const [publicaciones, logros] = await Promise.all([misPublicaciones(actor), logrosDe(actor.id)]);
  return {
    esquema: "escenara.comunidad",
    version: 1,
    exportadoEl: new Date().toISOString(),
    publicaciones,
    logros: logros
      .filter((l) => l.conseguidoEl !== null)
      .map(({ clave, titulo, conseguidoEl }) => ({ clave, titulo, conseguidoEl })),
  };
}
