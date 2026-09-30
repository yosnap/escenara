import { LIMITE_SUBIDA, subirActivoDeInstalacion } from "@/server/marca/activos";
import { exigirAdministracion, exigirRitmoDeMarca, leerArchivo, manejador } from "@/server/marca/http";
import { activoAVista } from "@/server/marca/instalacion";

export const dynamic = "force-dynamic";

/**
 * Sube un logotipo (`tipo=logotipo`) o una fuente (`tipo=fuente`, con su familia y su declaración de licencia) de la
 * instalación. El archivo se comprueba por su contenido; lo que no se puede comprobar no entra.
 */
export const POST = manejador(async (peticion: Request, __: unknown, actor) => {
  exigirAdministracion(actor);
  await exigirRitmoDeMarca(actor);
  const tipo = new URL(peticion.url).searchParams.get("tipo");
  const maximo = tipo === "fuente" ? LIMITE_SUBIDA.fuente : LIMITE_SUBIDA.logotipo;
  const { archivo, campos } = await leerArchivo(peticion, maximo);
  const fila = await subirActivoDeInstalacion(actor, tipo, archivo, campos);
  return Response.json({ activo: activoAVista(fila) }, { status: 201 });
});
