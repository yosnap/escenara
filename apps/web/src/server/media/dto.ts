import type { Medio } from "@/lib/media/tipos";
import { urlTemporal } from "../almacenamiento";
import type { FilaMedio } from "../db/esquema";

/**
 * Vista de un medio para el navegador, con la URL temporal de siempre. Va aparte del servicio de la biblioteca para que
 * una lectura que solo pinta medios (la comparativa sin generar, por ejemplo) no arrastre todo lo que la biblioteca
 * importa para subir, recortar o validar archivos.
 */

/** Quién hace la petición. El admin ve lo de todos; nadie más ve lo ajeno. */
export interface Actor {
  id: string;
  esAdmin: boolean;
}

export function aDto(fila: FilaMedio, actor: Actor, propietario?: { id: string; nombre: string }): Medio {
  const esDueno = fila.ownerId === actor.id;
  return {
    id: fila.id,
    tipo: fila.kind,
    nombre: fila.originalName,
    mime: fila.mimeType,
    tamano: fila.sizeBytes,
    ancho: fila.width,
    alto: fila.height,
    duracion: fila.durationSeconds,
    titulo: fila.title,
    altEs: fila.altEs,
    altEn: fila.altEn,
    url: urlTemporal(fila.storageKey),
    creadoEn: fila.createdAt.toISOString(),
    actualizadoEn: fila.updatedAt.toISOString(),
    enPapelera: fila.deletedAt !== null,
    origen: fila.sourceUrl,
    documento: fila.isDocument,
    ...(propietario ? { propietario } : {}),
    permisos: { editarImagen: esDueno, borrarDefinitivo: esDueno },
  };
}
