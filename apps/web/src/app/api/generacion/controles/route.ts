import { esIdentificadorDeModelo } from "@/lib/catalogo";
import { esTipoTrabajo } from "@/lib/generacion";
import { evaluarControles } from "@/server/controles/consulta";
import { ErrorGeneracion } from "@/server/generacion/errores";
import { exigirRitmoDeConsultas, manejador } from "@/server/generacion/http";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Identificador opcional que llega del navegador: o es un UUID, o no viene. */
function uuidOpcional(valor: string | null, queEs: string): string | null {
  if (valor === null || valor === "") return null;
  if (!UUID.test(valor)) throw new ErrorGeneracion(400, `Ese ${queEs} no es válido.`);
  return valor;
}

/**
 * Estado de los controles previos: qué diría la puerta si generaras ahora mismo (RF12).
 *
 * `?tipo=fotograma|animacion` y, opcionalmente, `&modelo=`, `&personajeId=`, `&medioId=` y `&escenaId=`.
 *
 * **Es una lectura.** No encola nada, no apunta ningún movimiento de presupuesto y no llama a ningún endpoint
 * de pago del proveedor: lo único que consulta fuera es el saldo, por el mismo endpoint gratuito que la
 * estimación y con su misma caché. Un `GET` nunca puede gastar dinero de nadie.
 */
export const GET = manejador(async (peticion: Request, _: unknown, actor) => {
  const parametros = new URL(peticion.url).searchParams;
  const tipo = parametros.get("tipo");
  if (!esTipoTrabajo(tipo)) throw new ErrorGeneracion(400, "Tipo de trabajo no válido.");
  const modelo = parametros.get("modelo");
  if (modelo !== null && modelo !== "" && !esIdentificadorDeModelo(modelo)) {
    throw new ErrorGeneracion(400, "Ese modelo no es válido.");
  }
  await exigirRitmoDeConsultas(actor, "controles");
  return Response.json(
    await evaluarControles(actor, {
      tipo,
      modelo: modelo === "" ? null : modelo,
      personajeId: uuidOpcional(parametros.get("personajeId"), "personaje"),
      medioId: uuidOpcional(parametros.get("medioId"), "identificador de imagen"),
      escenaId: uuidOpcional(parametros.get("escenaId"), "identificador de escena"),
    }),
  );
});
