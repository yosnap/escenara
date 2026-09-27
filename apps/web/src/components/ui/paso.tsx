import type { ReactNode } from "react";

/** Paso numerado del flujo de creación. */
export function Paso({ numero, titulo, children }: { numero: number; titulo: string; children: ReactNode }) {
  return (
    <section aria-label={`Paso ${numero}: ${titulo}`} className="flex flex-col gap-4">
      <h2 className="flex items-center gap-3 text-2xl font-bold text-texto">
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
