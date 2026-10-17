"use client";

import { DialogoImagenGenerada, type PedidoDeImagen } from "@/components/ui/imagen-generada/dialogo-imagen-generada";

/**
 * Qué se encarga: retirar a la gente de una foto del lugar, o un candidato del lugar desde su descripción (una foto
 * realista de un lugar real o el maestro de uno animado).
 */
export type EncargoDeFoto = { tipo: "retirar-personas"; referenciaId: string; medioId: string } | { tipo: "candidato" };

/** Textos y datos del encargo, según el tipo y el acabado del lugar. */
function pedidoDe(lugarId: string, encargo: EncargoDeFoto, animado: boolean): PedidoDeImagen {
  const url = `/api/lugares/${lugarId}/edicion`;
  if (encargo.tipo === "retirar-personas") {
    return {
      url,
      medioId: encargo.medioId,
      cuerpo: { tipo: encargo.tipo, referenciaId: encargo.referenciaId },
      titulo: "Retirar a la gente de la foto",
      descripcion:
        "Una edición de imagen que quita a las personas y rehace lo que había detrás. Para hacerla, esta foto se envía tal cual, con las personas que salen en ella, a KIE y al proveedor del modelo que la edita. No se pixelan caras: el generador copiaría el pixelado.",
      etiquetaDerechos: "Puedo usar esta foto y lo que se genere con ella",
      mensajeEncargado:
        "Encargado. La foto sin personas aparecerá en el lugar al terminar (recarga la página). Mírala antes de declarar: puede quedar gente pequeña al fondo.",
    };
  }
  return {
    url,
    medioId: null,
    cuerpo: { tipo: encargo.tipo },
    titulo: animado ? "Generar un candidato del lugar" : "Generar una imagen del lugar",
    descripcion: animado
      ? "Una imagen del lugar, vacía, desde su descripción guardada y su estilo. Es una generación de imagen y se cobra."
      : "Una foto realista del lugar, vacía, desde su descripción guardada. Es un sitio inventado: al declararlo, elige «Las he generado aquí». Es una generación de imagen y se cobra.",
    etiquetaDerechos: "Puedo usar lo que se genere",
    mensajeEncargado:
      "Encargado. La imagen aparecerá en el lugar al terminar (recarga la página), marcada como generada. Si te gusta, márcala como maestra.",
  };
}

/**
 * **Foto generada de un lugar, con su coste confirmado.** Es una imagen, así que cuesta lo que un fotograma (unos 4
 * créditos con Nano Banana 2 Lite, medido el 2026-09-30) y pasa por la misma puerta (`DialogoImagenGenerada`). El
 * resultado entra en el lugar al terminar, como foto generada; no sustituye a nada por su cuenta salvo a la maestra de
 * la que se retiró la gente.
 */
export function DialogoFotoGenerada({
  lugarId,
  animado,
  encargo,
  onCerrar,
  onEncargado,
}: {
  lugarId: string;
  animado: boolean;
  encargo: EncargoDeFoto | null;
  onCerrar: () => void;
  onEncargado: (mensaje: string) => void;
}) {
  // Sin encargo el diálogo sigue montado y cerrado: así devuelve el foco al botón que lo abrió.
  const pedido = pedidoDe(lugarId, encargo ?? { tipo: "candidato" }, animado);
  return (
    <DialogoImagenGenerada pedido={pedido} abierto={encargo !== null} onCerrar={onCerrar} onEncargado={onEncargado} />
  );
}
