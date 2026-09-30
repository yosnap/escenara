import type { ReactNode } from "react";

/**
 * Paso numerado del flujo de creación. Dentro de un `Multipaso`, su título es a donde va el foco al cambiar de paso
 * (`data-titulo-paso`, enfocable solo por programa).
 */
export function Paso({ numero, titulo, children }: { numero: number; titulo: string; children: ReactNode }) {
  return (
    <section aria-label={`Paso ${numero}: ${titulo}`} className="flex flex-col gap-4">
      <h2 data-titulo-paso tabIndex={-1} className="flex items-center gap-3 text-2xl font-bold text-texto outline-none">
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-degradado-chispa text-base text-[#182032]"
        >
          {numero}
        </span>
        {titulo}
      </h2>
      {children}
    </section>
  );
}
