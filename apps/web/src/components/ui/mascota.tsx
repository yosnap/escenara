"use client";

import { motion, useReducedMotion } from "motion/react";
import { useId } from "react";
import { cn } from "./cn";

export type ExpresionChispa = "saluda" | "senala" | "celebra";

const MOVIMIENTO: Record<ExpresionChispa, { animate: Record<string, number[]>; duration: number }> = {
  // Balanceo suave, como quien saluda con todo el cuerpo.
  saluda: { animate: { rotate: [0, -10, 8, -6, 0] }, duration: 2.4 },
  // Se inclina y avanza un poco hacia la derecha, señalando.
  senala: { animate: { rotate: [0, 12, 12, 0], x: [0, 6, 6, 0] }, duration: 2.2 },
  // Salta y se balancea (la cara siempre derecha): solo para hitos reales.
  celebra: {
    animate: { y: [0, -18, 0, -8, 0], rotate: [0, -12, 12, -6, 0], scale: [1, 1.1, 1, 1.05, 1] },
    duration: 1.6,
  },
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
  const reducido = useReducedMotion();
  const id = useId();
  const degradado = `${id}-degradado`;
  const mov = MOVIMIENTO[expresion];
  return (
    <motion.svg
      viewBox="0 0 100 100"
      width={tamano}
      height={tamano}
      role={etiqueta ? "img" : undefined}
      aria-label={etiqueta}
      aria-hidden={etiqueta ? undefined : true}
      className={cn("overflow-visible", className)}
      animate={reducido ? undefined : mov.animate}
      // Se mueve unas pocas veces y se detiene: nada se anima sin fin (WCAG 2.2.2).
      transition={{ duration: mov.duration, repeat: 2, repeatDelay: 1.2, ease: "easeInOut" }}
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
      <motion.g
        style={{ transformOrigin: "50px 47px" }}
        animate={reducido ? undefined : { scaleY: [1, 1, 0.1, 1] }}
        transition={{ duration: 3.6, times: [0, 0.92, 0.96, 1], repeat: 3 }}
      >
        <ellipse cx="42" cy="47" rx="3" ry="4" fill="#182032" />
        <ellipse cx="58" cy="47" rx="3" ry="4" fill="#182032" />
      </motion.g>
      {/* Boca: sonrisa, o abierta al celebrar */}
      {expresion === "celebra" ? (
        <path d="M43 56Q50 66 57 56Z" fill="#182032" />
      ) : (
        <path d="M43 56Q50 62 57 56" fill="none" stroke="#182032" strokeWidth="2.5" strokeLinecap="round" />
      )}
    </motion.svg>
  );
}
