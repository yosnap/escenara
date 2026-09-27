import { Camera, WandSparkles } from "lucide-react";
import { ETIQUETA_ORIGEN_REFERENCIA, type OrigenReferencia } from "@/lib/personajes";
import { cn } from "../cn";

/**
 * Distintivo del origen de una referencia. Existe como pieza propia porque es la **última capa** de la regla
 * que recorre la base de datos, la API y la interfaz: una vista generada se muestra siempre etiquetada, con
 * icono y con texto, y nunca se presenta como una foto del personaje.
 *
 * `sobreImagen` la pinta encima de la miniatura, que es donde de verdad hace falta: una etiqueta en un pie de
 * foto se pierde de vista al mirar la imagen.
 */
export function DistintivoOrigen({
  origen,
  sobreImagen = false,
  className,
}: {
  origen: OrigenReferencia;
  sobreImagen?: boolean;
  className?: string;
}) {
  const generada = origen === "vista_generada";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold",
        generada ? "bg-chispa text-[#182032]" : "bg-superficie text-texto",
        sobreImagen && "shadow-md",
        className,
      )}
    >
      <span aria-hidden>{generada ? <WandSparkles className="size-3" /> : <Camera className="size-3" />}</span>
      {ETIQUETA_ORIGEN_REFERENCIA[origen]}
    </span>
  );
}
