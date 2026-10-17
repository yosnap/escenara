"use client";

import { useState } from "react";
import { DialogoImagenGenerada } from "@/components/ui/imagen-generada/dialogo-imagen-generada";
import { Selector } from "@/components/ui/select";
import {
  AYUDA_PAPEL_REFERENCIA,
  NOMBRE_PAPEL_REFERENCIA,
  PAPELES_GENERABLES,
  type PapelReferencia,
  type TipoProducto,
} from "@/lib/productos";

/**
 * **Vista generada de un producto, con su coste confirmado.** Se elige qué vista (la frontal con la etiqueta, el
 * envase entero, el detalle de la tapa o el producto solo) y se genera desde la descripción guardada, por la misma
 * puerta que un fotograma (`DialogoImagenGenerada`). El resultado entra en el producto con ese papel, marcado como
 * generado.
 */
export function DialogoVistaGenerada({
  productoId,
  tipo,
  abierto,
  onCerrar,
  onEncargado,
}: {
  productoId: string;
  tipo: TipoProducto;
  abierto: boolean;
  onCerrar: () => void;
  onEncargado: (mensaje: string) => void;
}) {
  const vistas = PAPELES_GENERABLES[tipo];
  const [papel, setPapel] = useState<PapelReferencia>(vistas[0] ?? "suelto");
  return (
    <DialogoImagenGenerada
      abierto={abierto}
      onCerrar={onCerrar}
      onEncargado={onEncargado}
      pedido={{
        url: `/api/productos/${productoId}/generacion`,
        medioId: null,
        cuerpo: { papel },
        titulo: "Generar una imagen del producto",
        descripcion:
          "Una imagen de referencia desde la descripción guardada del producto. Es una generación de imagen y se cobra: verás el coste antes de confirmar.",
        etiquetaDerechos: "Puedo usar lo que se genere y la marca que aparezca en ello",
        mensajeEncargado: `Encargado. La vista «${NOMBRE_PAPEL_REFERENCIA[papel]}» aparecerá en el producto al terminar (recarga la página), marcada como generada. Mírala antes de usarla: si la etiqueta no sale bien, cámbiale el papel.`,
      }}
    >
      <Selector
        etiqueta="Qué vista generar"
        valor={papel}
        opciones={vistas.map((p) => ({
          value: p,
          label: NOMBRE_PAPEL_REFERENCIA[p],
          descripcion: AYUDA_PAPEL_REFERENCIA[p],
        }))}
        onCambio={(v) => v && setPapel(v as PapelReferencia)}
      />
    </DialogoImagenGenerada>
  );
}
