import type { ModeloVista } from "@/lib/catalogo";
import {
  exigirCupoTemporal,
  instruccionesTemporales,
  leerReferenciasTemporales,
  referenciasOrdenadas,
  resolverMenciones,
  tieneLugarBase,
} from "@/lib/referencias-temporales";
import type { FilaTrabajo } from "../db/esquema";
import { cupoDeGaleria } from "../productos/reparto-del-envio";
import type { Adaptador } from "../proveedores/contrato";
import { imagenPropia } from "./comprobaciones";
import { ErrorGeneracion } from "./errores";

export function esEdicionConLugar(valor: unknown): boolean {
  try {
    return tieneLugarBase(valor);
  } catch (error) {
    throw new ErrorGeneracion(400, (error as Error).message);
  }
}

/**
 * Sin imagen de partida el modelo es de texto a imagen y no recibe ninguna imagen: unas referencias de la escena
 * se perderían en silencio al preparar el envío. La pantalla ya lo impide; aquí se rechaza si llegan igual.
 */
export function exigirImagenParaTemporales(sinReferencia: boolean, valor: unknown): void {
  if (!sinReferencia || !Array.isArray(valor) || valor.length === 0) return;
  throw new ErrorGeneracion(
    400,
    "Las referencias de la escena necesitan una imagen de partida: sin personaje ni imagen, la escena se genera solo con texto y esas imágenes no llegarían al modelo. No se ha cobrado nada: elige un personaje o una imagen, o quita las referencias, y vuelve a confirmar.",
  );
}

/** Toda validación termina antes de pagar traducción o reservar una generación. */
export async function prepararReferenciasTemporales(
  usuarioId: string,
  valor: unknown,
  texto: string,
  modelo: ModeloVista,
  adaptador: Adaptador,
  otras: number,
) {
  let referencias: ReturnType<typeof leerReferenciasTemporales>;
  let prompt: string;
  try {
    referencias = referenciasOrdenadas(leerReferenciasTemporales(valor));
    exigirCupoTemporal(
      Math.min(modelo.parametros.maximoReferencias, cupoDeGaleria(adaptador, modelo)),
      otras,
      referencias.length,
    );
    prompt = resolverMenciones(texto, referencias, referencias[0]?.uso === "lugar" ? 1 : otras + 1);
  } catch (error) {
    throw new ErrorGeneracion(400, (error as Error).message);
  }
  for (const referencia of referencias) {
    const imagen = await imagenPropia(usuarioId, referencia.medioId);
    if (!modelo.parametros.formatosReferencia.includes(imagen.mimeType))
      throw new ErrorGeneracion(400, "El modelo no admite el formato de una de las referencias temporales.");
  }
  return {
    referencias,
    otras,
    lugarBase: referencias[0]?.uso === "lugar",
    primeraImagen: referencias[0]?.uso === "lugar" ? 1 : otras + 1,
    prompt,
    instrucciones: instruccionesTemporales(referencias, referencias[0]?.uso === "lugar" ? 1 : otras + 1),
  };
}

/** La cola conserva el orden de las etiquetas; vuelve a exigir propiedad y disponibilidad al enviar. */
export async function imagenesTemporalesDelTrabajo(fila: FilaTrabajo, maximo: number, otras: number) {
  const referencias = leerReferenciasTemporales(
    (fila.input as { referenciasTemporales?: unknown }).referenciasTemporales,
  );
  exigirCupoTemporal(maximo, otras, referencias.length);
  if (fila.input.modoReferencias === "lugar_base" && fila.input.cantidadReferenciasPrevias !== otras)
    throw new ErrorGeneracion(409, "Las imágenes de identidad han cambiado: revisa el encargo antes de generar.");
  if (
    referencias.length &&
    (fila.input as { primeraReferenciaTemporal?: unknown }).primeraReferenciaTemporal !==
      ((fila.input as { modoReferencias?: unknown }).modoReferencias === "lugar_base" ? 1 : otras + 1)
  )
    throw new ErrorGeneracion(
      409,
      "Las imágenes de partida han cambiado: no se enviarán referencias con etiquetas desplazadas. Revisa el encargo.",
    );
  return Promise.all(referencias.map((r) => imagenPropia(fila.userId, r.medioId)));
}
