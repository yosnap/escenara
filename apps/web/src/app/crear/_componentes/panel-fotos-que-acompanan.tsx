import { Images } from "lucide-react";
import { MiniaturaMedio } from "@/components/ui/media/miniatura-medio";
import type { EvaluacionVista } from "@/lib/controles";
import type { Medio } from "@/lib/media/tipos";

/**
 * **Zona de claridad**: las fotos del producto y la del lugar que viajan con el fotograma junto a las del personaje
 * (o, en el clip, junto a la imagen que se anima), y cuántas imágenes van en total. Las cifras y las fotos salen de la
 * consulta de antes de pagar, que las calcula con el mismo reparto que el envío. Superficie neutra, sin degradados y sin animación.
 */
export function PanelFotosQueAcompanan({
  evaluacion,
  temporales = 0,
  clip = false,
}: {
  evaluacion: EvaluacionVista;
  /** Las referencias temporales de este envío, que viajan además y se enseñan en su propio panel. */
  temporales?: number;
  /** En el clip, la imagen que cuenta en el total es la que se anima, no las fotos del personaje. */
  clip?: boolean;
}) {
  const { fotosQueViajan: fotos, referencias: reparto } = evaluacion;
  if (!fotos || !reparto) return null;
  const total = reparto.personaje + fotos.producto.length + fotos.lugar.length + temporales;
  const recortadas = fotos.fotosDelPersonaje - reparto.personaje;
  return (
    <section
      aria-label="Otras fotos que se enviarán al modelo"
      className="flex flex-col gap-4 rounded-tarjeta border-2 border-borde bg-superficie p-4"
    >
      <h3 className="flex items-center gap-2 font-semibold text-texto">
        <span aria-hidden>
          <Images className="size-4" />
        </span>
        <span>También se enviarán</span>
      </h3>
      {fotos.producto.length > 0 && <Grupo titulo="Del producto" medios={fotos.producto} />}
      {fotos.lugar.length > 0 && <Grupo titulo="Del lugar, su foto principal" medios={fotos.lugar} />}
      <p className="text-sm text-texto-suave">
        En total viajan {total} {total === 1 ? "imagen" : "imágenes"}
        {clip ? ", contando la imagen que se anima," : temporales > 0 ? ", contando las referencias temporales," : ""}{" "}
        de las {fotos.cupo} que admite este modelo.
        {recortadas > 0 &&
          ` Del personaje solo caben ${reparto.personaje} de sus ${fotos.fotosDelPersonaje} fotos: el resto del cupo es del producto y del lugar.`}
      </p>
    </section>
  );
}

function Grupo({ titulo, medios }: { titulo: string; medios: Medio[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-sm font-semibold text-texto">{titulo}</h4>
      <ul className="flex flex-wrap gap-3">
        {medios.map((medio) => (
          <li key={medio.id} className="block size-24 overflow-hidden rounded-control border border-borde bg-elevada">
            <MiniaturaMedio medio={medio} alt={titulo} />
          </li>
        ))}
      </ul>
    </div>
  );
}
