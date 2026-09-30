import { useId } from "react";
import { cn } from "./cn";

export type ExpresionChispa = "saluda" | "senala" | "celebra";

/**
 * Cada expresión es una animación CSS de `globals.css` (`chispa-saluda`, `chispa-senala`, `chispa-celebra`): se mueve
 * tres veces con una pausa entre una y otra y se detiene, porque nada se anima sin fin (WCAG 2.2.2). Va con
 * `motion-safe:`, así que con «reducir movimiento» la mascota se queda quieta. Antes lo hacía la librería de
 * animación, que por una mascota cargaba 41 KB en «Crear» y en la producción.
 */
const MOVIMIENTO: Record<ExpresionChispa, string> = {
  // Balanceo suave, como quien saluda con todo el cuerpo.
  saluda: "motion-safe:animate-[chispa-saluda_3.6s_ease-in-out_3]",
  // Se inclina y avanza un poco hacia la derecha, señalando.
  senala: "motion-safe:animate-[chispa-senala_3.4s_ease-in-out_3]",
  // Salta y se balancea (la cara siempre derecha): solo para hitos reales.
  celebra: "motion-safe:animate-[chispa-celebra_2.8s_ease-in-out_3]",
};

/**
 * Chispa, la mascota: la estrella de cuatro puntas del logotipo con cara. Es decorativa salvo que se
 * indique una `etiqueta`; con movimiento reducido se muestra estática.
 */
export function MascotaChispa({
  expresion = "saluda",
  tamano = 96,
  etiqueta,
  className,
}: {
  expresion?: ExpresionChispa;
  tamano?: number;
  etiqueta?: string;
  className?: string;
}) {
  const id = useId();
  const degradado = `${id}-degradado`;
  return (
    <svg
      viewBox="0 0 100 100"
      width={tamano}
      height={tamano}
      role={etiqueta ? "img" : undefined}
      aria-label={etiqueta}
      aria-hidden={etiqueta ? undefined : true}
      className={cn("origin-center overflow-visible [transform-box:fill-box]", MOVIMIENTO[expresion], className)}
    >
      <defs>
        <linearGradient id={degradado} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--color-v-coral)" />
          <stop offset="100%" stopColor="var(--color-v-sol)" />
        </linearGradient>
      </defs>
      <path
        d="M50 4C54 34 66 46 96 50C66 54 54 66 50 96C46 66 34 54 4 50C34 46 46 34 50 4Z"
        fill={`url(#${degradado})`}
      />
      {/* Mejillas */}
      <circle cx="38" cy="56" r="3.5" fill="var(--color-v-fucsia)" opacity="0.55" />
      <circle cx="62" cy="56" r="3.5" fill="var(--color-v-fucsia)" opacity="0.55" />
      {/* Ojos con parpadeo */}
      <g style={{ transformOrigin: "50px 47px" }} className="motion-safe:animate-[chispa-parpadeo_3.6s_linear_4]">
        <ellipse cx="42" cy="47" rx="3" ry="4" fill="#182032" />
        <ellipse cx="58" cy="47" rx="3" ry="4" fill="#182032" />
      </g>
      {/* Boca: sonrisa, o abierta al celebrar */}
      {expresion === "celebra" ? (
        <path d="M43 56Q50 66 57 56Z" fill="#182032" />
      ) : (
        <path d="M43 56Q50 62 57 56" fill="none" stroke="#182032" strokeWidth="2.5" strokeLinecap="round" />
      )}
    </svg>
  );
}
