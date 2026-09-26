import { esTipoMedio } from "@/lib/media/reglas";
import { leerArchivo, manejador } from "@/server/media/http";
import { crearMedio, listarMedios } from "@/server/media/servicio";

export const dynamic = "force-dynamic";

/** Lista paginada: `?busqueda=&tipo=imagen,video&papelera=1&pagina=1` (`tipo` admite varios separados por comas). */
export const GET = manejador(async (peticion: Request) => {
  const p = new URL(peticion.url).searchParams;
  const pagina = await listarMedios({
    busqueda: p.get("busqueda") ?? "",
    tipos: (p.get("tipo") ?? "").split(",").filter(esTipoMedio),
    papelera: p.get("papelera") === "1",
    pagina: Number(p.get("pagina") ?? 1),
  });
  return Response.json(pagina);
});

/**
 * Subida multiparte: `archivo`; para vídeo y audio, `duracion`, `ancho` y `alto` leídos por el navegador;
 * y `tipos`, los tipos que admite el campo de origen.
 */
export const POST = manejador(async (peticion: Request) => {
  const { archivo, campos } = await leerArchivo(peticion);
  const numero = (nombre: string) => {
    const valor = campos.get(nombre);
    return typeof valor === "string" && valor !== "" ? Number(valor) : undefined;
  };
  // `tipos` (opcional, separados por comas) limita lo que admite el campo que sube el archivo.
  const tipos = String(campos.get("tipos") ?? "")
    .split(",")
    .filter(esTipoMedio);
  const medio = await crearMedio(
    archivo,
    { duracion: numero("duracion"), ancho: numero("ancho"), alto: numero("alto") },
    tipos.length > 0 ? tipos : undefined,
  );
  return Response.json(medio, { status: 201 });
});
