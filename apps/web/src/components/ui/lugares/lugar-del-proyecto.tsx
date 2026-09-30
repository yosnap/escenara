"use client";

import Link from "next/link";
import { Selector } from "@/components/ui/select";
import { type LugarResumen, queFaltaAlLugar } from "@/lib/lugares";
import { useLugares } from "./selector-lugar";

const SIN_LUGAR = "__sin_lugar";

/**
 * **El lugar del proyecto**: el que heredan sus escenas mientras no elijan otro. Solo se ofrecen los del mismo
 * acabado que el proyecto; el servidor lo vuelve a comprobar. Cambiarlo devuelve a borrador las escenas aprobadas
 * que lo heredan, porque generarían otra cosa.
 */
export function LugarDelProyecto({
  valor,
  acabado,
  deshabilitado,
  onCambio,
  lugares: dados,
}: {
  valor: string | null;
  acabado: "realista" | "animado";
  deshabilitado?: boolean;
  onCambio: (lugarId: string | null) => void;
  /** Lista ya cargada, para el catálogo de componentes; sin ella se pide al servidor. */
  lugares?: LugarResumen[];
}) {
  const pedidos = useLugares(!dados);
  const lugares = (dados ?? pedidos.lugares ?? []).filter((l) => l.acabado === acabado);
  return (
    <div className="flex flex-col gap-2">
      <Selector
        etiqueta="Lugar del proyecto (opcional)"
        valor={valor ?? SIN_LUGAR}
        deshabilitado={deshabilitado || (!dados && pedidos.lugares === null)}
        opciones={[
          { value: SIN_LUGAR, label: "Sin lugar", descripcion: "Cada escena dice dónde ocurre." },
          ...lugares.map((l) => ({
            value: l.id,
            label: l.nombre,
            descripcion: queFaltaAlLugar(l).length > 0 ? `Falta: ${queFaltaAlLugar(l).join(" ")}` : l.descripcion,
          })),
        ]}
        onCambio={(v) => v && onCambio(v === SIN_LUGAR ? null : v)}
      />
      <p className="text-sm text-texto-suave">
        Las escenas lo heredan y cada una puede cambiarlo o quitarlo. Solo salen tus lugares{" "}
        {acabado === "animado" ? "animados" : "reales"}.{" "}
        <Link href="/lugares" className="font-semibold text-acento underline">
          Tus lugares
        </Link>
      </p>
    </div>
  );
}
