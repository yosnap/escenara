import { avisoFotoDeProducto, type FotoDeProductoDelClip } from "@/lib/foto-de-producto";
import { Aviso } from "../feedback";

/**
 * Aviso junto al selector de producto: el modelo del clip no admite la foto del producto. Solo sale con un
 * producto que **tiene fotos vigentes** (sin ellas ya hay otro aviso, y no hay foto que perder) y con un modelo que no la
 * admite. Es informativo: no bloquea ni cambia de modelo, y el control previo del servidor sigue exigiendo su
 * confirmación.
 */
export function AvisoFotoDeProducto({
  foto,
  referencias,
}: {
  foto: FotoDeProductoDelClip | null | undefined;
  /** Fotos del producto elegido que no están en la papelera: las que el servidor enviaría. */
  referencias: number;
}) {
  if (!foto || foto.admite || referencias === 0) return null;
  return <Aviso tono="aviso">{avisoFotoDeProducto(foto)}</Aviso>;
}
