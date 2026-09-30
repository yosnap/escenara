import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * Contenedor de una **tabla ancha** que se desplaza en horizontal en pantallas estrechas. Sin nada enfocable dentro,
 * un contenedor así no se puede desplazar con el teclado: por eso es una región con nombre que recibe el foco (Tab y
 * luego las flechas), y lo enseña con el aro de siempre.
 */
export function TablaDesplazable({
  etiqueta,
  className,
  children,
}: {
  /** Qué tabla es, para quien llega a ella con el lector de pantalla («Plan del proyecto por escenas»). */
  etiqueta: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/noNoninteractiveTabindex: una región desplazable necesita el foco para moverse con el teclado (WCAG 2.1.1)
    <section aria-label={etiqueta} tabIndex={0} className={cn("overflow-x-auto", className)}>
      {children}
    </section>
  );
}
