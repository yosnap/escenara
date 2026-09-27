import type { ReactNode } from "react";

/** Bloque de la página de ajustes: icono, título, descripción y controles. */
export function Seccion({
  titulo,
  descripcion,
  icono,
  children,
}: {
  titulo: string;
  descripcion: string;
  icono: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-tarjeta border border-borde bg-superficie p-6">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-acento/12 text-acento [&>svg]:size-5"
        >
          {icono}
        </span>
        <div>
          <h2 className="text-xl font-bold text-texto">{titulo}</h2>
          <p className="text-sm text-texto-suave">{descripcion}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
