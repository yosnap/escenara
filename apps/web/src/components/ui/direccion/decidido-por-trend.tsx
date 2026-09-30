import { Lock } from "lucide-react";
import { type CategoriaDecidible, etiquetaDecidible, motivoDecididaPorTrend } from "@/lib/trends";

/**
 * Lo que la dirección del clip necesita saber del trend elegido. Lo lee la pantalla de la plantilla del trend (su
 * versión vigente), nunca lo escribe el usuario.
 */
export interface TrendDeLaDireccion {
  nombre: string;
  /** Categorías de la dirección que dicta el trend: no se preguntan y el servidor no las compone. */
  decide: readonly CategoriaDecidible[];
  /** Sin habla, la dirección no pide cómo se dice ni con qué acento. */
  permiteHabla: boolean;
}

const listaConY = (partes: readonly string[]) =>
  partes.length < 2 ? partes.join("") : `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;

/**
 * **Lo que decide el trend**, en lugar de sus controles. Las categorías que dicta el trend no se preguntan: se dicen
 * aquí, con el motivo escrito, para que nadie busque el control que falta ni crea que su elección se va a enviar.
 *
 * No es un aviso de error ni de gasto: es información de la dirección, con un candado y la lista de lo bloqueado.
 */
export function DecididoPorTrend({ trend }: { trend: TrendDeLaDireccion }) {
  if (trend.decide.length === 0) return null;
  const motivo = motivoDecididaPorTrend(trend.nombre);
  const etiquetas = trend.decide.map(etiquetaDecidible);
  return (
    <section
      aria-label={motivo}
      className="flex flex-col gap-3 rounded-tarjeta border-2 border-borde bg-superficie p-4"
      data-decidido-por-trend
    >
      <p className="flex items-center gap-2 font-semibold text-texto">
        <Lock className="size-4 shrink-0" aria-hidden />
        {motivo}
      </p>
      <ul className="flex flex-wrap gap-2" aria-label="Opciones que decide el trend">
        {etiquetas.map((etiqueta) => (
          <li
            key={etiqueta}
            className="rounded-full bg-elevada px-3 py-1 text-sm font-medium text-texto"
            title={`${etiqueta}: ${motivo}`}
          >
            {etiqueta}
          </li>
        ))}
      </ul>
      <p className="text-sm text-texto-suave">
        Su texto ya dicta {listaConY(etiquetas.map((e) => e.toLowerCase()))}, así que no se te pregunta y no se envía
        nada tuyo sobre eso. El resto de la dirección sigue siendo tuyo.
      </p>
    </section>
  );
}
