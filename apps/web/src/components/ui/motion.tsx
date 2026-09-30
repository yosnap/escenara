"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { type ReactNode, useRef, useState } from "react";
import { IconoChispa } from "./chispa";
import { cn } from "./cn";

export interface CapaParallax {
  id: string;
  contenido: ReactNode;
  /** Desplazamiento vertical en px a lo largo del recorrido; negativo sube más rápido que el scroll. */
  velocidad: number;
  className?: string;
}

/** Escena con capas que se mueven a distinta velocidad al hacer scroll. Sin movimiento si se prefiere reducido. */
export function EscenaParallax({
  capas,
  className,
  children,
}: {
  capas: CapaParallax[];
  className?: string;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reducido = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  return (
    <div ref={ref} className={cn("relative overflow-hidden", className)}>
      {capas.map((c) => (
        <CapaMovil key={c.id} progreso={scrollYProgress} velocidad={reducido ? 0 : c.velocidad} className={c.className}>
          {c.contenido}
        </CapaMovil>
      ))}
      <div className="relative">{children}</div>
    </div>
  );
}

function CapaMovil({
  progreso,
  velocidad,
  className,
  children,
}: {
  progreso: ReturnType<typeof useScroll>["scrollYProgress"];
  velocidad: number;
  className?: string;
  children: ReactNode;
}) {
  const y = useTransform(progreso, [0, 1], [0, velocidad]);
  return (
    <motion.div aria-hidden style={{ y }} className={cn("pointer-events-none absolute", className)}>
      {children}
    </motion.div>
  );
}

const COLORES_CONFETI = [
  "text-v-cobalto",
  "text-v-coral",
  "text-v-mandarina",
  "text-v-sol",
  "text-v-fucsia",
  "text-v-cian",
];

/** Confeti de chispas para hitos reales (personaje aprobado, vídeo exportado). Nunca en costes o consentimiento. */
export function useConfeti() {
  const [rafagas, setRafagas] = useState<number[]>([]);
  const reducido = useReducedMotion();
  const lanzar = () => {
    if (reducido) return;
    const id = Date.now();
    setRafagas((r) => [...r, id]);
    setTimeout(() => setRafagas((r) => r.filter((x) => x !== id)), 1400);
  };
  const confeti = (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {rafagas.map((id) =>
        Array.from({ length: 28 }, (_, i) => {
          const angulo = (i / 28) * Math.PI * 2;
          const distancia = 140 + ((i * 37) % 120);
          return (
            <motion.span
              // biome-ignore lint/suspicious/noArrayIndexKey: partículas fijas de una ráfaga, nunca se reordenan
              key={`${id}-${i}`}
              className={cn("absolute top-1/2 left-1/2", COLORES_CONFETI[i % COLORES_CONFETI.length])}
              initial={{ x: 0, y: 0, scale: 0.4, opacity: 1, rotate: 0 }}
              animate={{
                x: Math.cos(angulo) * distancia,
                y: Math.sin(angulo) * distancia + 120,
                scale: 1,
                opacity: 0,
                rotate: 180,
              }}
              transition={{ duration: 1.1, ease: "easeOut" }}
            >
              <IconoChispa className="size-6" />
            </motion.span>
          );
        }),
      )}
    </div>
  );
  return { lanzar, confeti };
}
