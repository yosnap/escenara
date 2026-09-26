import type { ReactNode } from "react";

/** Bloque de la página de cuenta (zona de claridad). */
export function Bloque({
  titulo,
  descripcion,
  icono,
  children,
}: {
  titulo: string;
  descripcion?: string;
  icono: ReactNode;
  children: ReactNode;
}) {
  const id = `bloque-${titulo.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-5 rounded-tarjeta border border-borde bg-superficie p-6">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-acento/12 text-acento [&>svg]:size-5"
        >
          {icono}
        </span>
        <div>
          <h2 id={id} className="text-xl font-bold text-texto">
            {titulo}
          </h2>
          {descripcion && <p className="text-sm text-texto-suave">{descripcion}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}
