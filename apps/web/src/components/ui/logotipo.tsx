"use client";

import { cn } from "./cn";
import { useMarca } from "./marca-contexto";

/**
 * Logotipo «Enfoque»: marco abierto con la chispa central. Usa los tokens del tema, así que sirve
 * en claro y en oscuro sin variantes de archivo. `solo-marca` omite el nombre.
 *
 * Con una **marca publicada** de la instalación (0.42.0) pinta sus logotipos subidos (el de cada tema, que se alternan
 * con el tema sin JavaScript) o, si no subió ninguno, el símbolo de siempre con el nombre de la instalación.
 */
export function Logotipo({
  variante = "horizontal",
  className,
}: {
  variante?: "horizontal" | "solo-marca";
  className?: string;
}) {
  const marca = useMarca();
  const horizontal = variante === "horizontal";
  const nombre = marca?.nombre ?? "Escenara";
  const claro = marca?.logos[horizontal ? "horizontal-claro" : "simbolo-claro"];
  const oscuro = marca?.logos[horizontal ? "horizontal-oscuro" : "simbolo-oscuro"];
  if (claro || oscuro) {
    const clases = cn(horizontal ? "h-8 w-auto" : "size-8 object-contain", className);
    return (
      <span className="inline-flex items-center">
        {/* biome-ignore lint/performance/noImgElement: logotipo de la instalación servido por nuestra ruta, sin optimizar a propósito (SVG) */}
        <img src={claro ?? oscuro} alt={nombre} className={cn(clases, claro && oscuro && "marca-solo-claro")} />
        {claro && oscuro && (
          // biome-ignore lint/performance/noImgElement: logotipo de la instalación para el tema oscuro
          <img src={oscuro} alt={nombre} className={cn(clases, "marca-solo-oscuro")} />
        )}
      </span>
    );
  }
  return (
    <svg
      viewBox={horizontal ? "0 0 444 100" : "0 0 100 100"}
      role="img"
      aria-label={nombre}
      className={cn(horizontal ? "h-8 w-auto" : "size-8", className)}
    >
      <g transform="translate(2 2)">
        <path
          d="M13 34V17H31M59 17H77V34M77 63V80H59M31 80H13V63"
          fill="none"
          stroke="var(--color-acento)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M45 32C47 41 51 45 59 48C51 51 47 55 45 64C43 55 39 51 31 48C39 45 43 41 45 32Z"
          fill="var(--color-chispa)"
        />
      </g>
      {horizontal && (
        <text x="115" y="67" fill="currentColor" fontFamily="inherit" fontSize="54" fontWeight="700" letterSpacing="-2">
          {nombre}
        </text>
      )}
    </svg>
  );
}
