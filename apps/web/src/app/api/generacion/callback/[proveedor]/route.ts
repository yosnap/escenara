import { atenderCallback, MAXIMO_CUERPO, PARAMETRO_TOKEN, PARAMETRO_TRABAJO } from "@/server/cola/callback";
import { ErrorGeneracion } from "@/server/generacion/errores";
import { respuestaError } from "@/server/generacion/http";

export const dynamic = "force-dynamic";

/**
 * Callback del proveedor: `POST /api/generacion/callback/<proveedor>?j=<trabajo>&t=<token>`.
 *
 * No lleva sesión ni `Origin`. Lo que lo autentica es el token aleatorio de ese trabajo concreto, que se
 * comprueba en tiempo constante contra la huella guardada. Del cuerpo **no se usa nada**: el estado y los
 * créditos se le preguntan al proveedor por el identificador de tarea guardado.
 *
 * Es idempotente: recibirlo dos veces no crea dos medios ni dos apuntes de consumo.
 */
export async function POST(peticion: Request, contexto: { params: Promise<{ proveedor: string }> }): Promise<Response> {
  try {
    const { proveedor } = await contexto.params;
    // Se corta antes de leer el cuerpo: esta ruta es pública y nadie debe poder hacernos leer megabytes.
    const declarado = Number(peticion.headers.get("content-length") ?? "0");
    if (Number.isFinite(declarado) && declarado > MAXIMO_CUERPO) {
      throw new ErrorGeneracion(413, "El callback es demasiado grande.");
    }
    const parametros = new URL(peticion.url).searchParams;
    const resultado = await atenderCallback(
      proveedor,
      parametros.get(PARAMETRO_TRABAJO),
      parametros.get(PARAMETRO_TOKEN),
      declarado,
    );
    return Response.json({ recibido: true, conciliado: resultado.conciliado });
  } catch (error) {
    return respuestaError(error);
  }
}
