import type { ReactNode } from "react";

export function Seccion({
  id,
  titulo,
  descripcion,
  children,
}: {
  id: string;
  titulo: string;
  descripcion: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className="scroll-mt-24 border-b border-borde/40 py-10">
      <h2 id={`${id}-titulo`} className="text-3xl font-bold text-texto">
        {titulo}
      </h2>
      <p className="mt-1 mb-6 max-w-2xl text-texto-suave">{descripcion}</p>
      {children}
    </section>
  );
}

export function Muestra({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-tarjeta border border-borde/50 bg-superficie p-5">
      <h3 className="text-sm font-bold tracking-wide text-texto-suave uppercase">{titulo}</h3>
      <div className="flex flex-wrap items-start gap-4">{children}</div>
    </div>
  );
}
