import { CAPACIDAD_DE_TIPO } from "@/lib/catalogo";
import { type EvaluacionVista, peorEstado } from "@/lib/controles";
import type { HechosModelo, HechosProducto, ParametrosControles } from "../controles/contrato";
import { hechosDeModelo } from "../controles/hechos";
import { evaluarParaMostrar } from "../controles/puerta";
import type { FilaEscena } from "../db/esquema";
import type { EleccionDeTrabajo } from "../generacion/precios";
import { completarModelosSugeridos } from "../productos/modelos-sugeridos";
import { hechosDelProducto, productoParaGenerar } from "../productos/prompt";
import { adaptadorDe } from "../proveedores/registro";

/**
 * La rejilla evalúa el fotograma y el clip por separado. El clip puede perder la foto del producto aunque el
 * fotograma la haya usado: se muestra su aviso antes de pulsar «Aprobar y animar», con la misma clave del motor
 * que luego exige la puerta del envío.
 */
export function vistaDeControlesProductoClip(
  modelo: HechosModelo,
  producto: HechosProducto,
  parametros: ParametrosControles,
): EvaluacionVista {
  const evaluacion = evaluarParaMostrar({ tipo: "animacion", parametros, modelo, producto });
  const comprobaciones = evaluacion.comprobaciones.filter((c) => c.regla.startsWith("producto-"));
  return { ...evaluacion, estado: peorEstado(comprobaciones.map((c) => c.estado)), comprobaciones };
}

export async function controlesProductoClip(
  usuarioId: string,
  escena: FilaEscena,
  eleccion: EleccionDeTrabajo | null,
  parametros: ParametrosControles,
): Promise<EvaluacionVista | null> {
  if (escena.productId === null || escena.clipFormat === "cantar" || !eleccion) return null;
  const producto = await productoParaGenerar(usuarioId, escena.productId, escena.productAction);
  if (!producto) return null;
  const modelo = eleccion.modelo;
  const adaptador = adaptadorDe(modelo.proveedor);
  const galeria = adaptador.referenciasDeGaleria?.(modelo) ?? modelo.parametros.maximoReferencias;
  const { hechos } = hechosDelProducto(producto, galeria, 1, false);
  await completarModelosSugeridos(hechos, CAPACIDAD_DE_TIPO.animacion);
  return vistaDeControlesProductoClip(hechosDeModelo("animacion", eleccion), hechos, parametros);
}
