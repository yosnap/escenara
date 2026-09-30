import { archivoDePublicacion } from "@/server/comunidad/consulta";
import { ErrorComunidad } from "@/server/comunidad/errores";
import { exigirRitmoDeLectura, exigirUuid, manejador } from "@/server/comunidad/http";
import { responderArchivo } from "@/server/servir-archivo";

export const dynamic = "force-dynamic";

/**
 * Archivo de la **copia** de una publicación. Es la única puerta a un medio publicado: se sirve solo si la publicación
 * está aprobada y vigente con la comunidad encendida, o a su autor y a quien modera. Todo lo demás responde 404 sin
 * distinguir la causa. Nunca entrega el original ni ninguna clave del almacenamiento.
 */
export const GET = manejador(
  async (peticion: Request, contexto: { params: Promise<{ id: string; posicion: string }> }, actor) => {
    await exigirRitmoDeLectura(actor);
    const { id, posicion } = await contexto.params;
    const n = /^\d{1,2}$/.test(posicion) ? Number(posicion) : -1;
    if (n < 0) throw new ErrorComunidad(404, "Ese archivo no existe.");
    const archivo = await archivoDePublicacion(actor, exigirUuid(id), n);
    return await responderArchivo(
      peticion,
      archivo.clave,
      archivo.mime,
      () => new ErrorComunidad(404, "El archivo publicado no está en el almacenamiento."),
    );
  },
);
