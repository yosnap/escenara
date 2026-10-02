import Link from "next/link";
import type { ReactNode } from "react";
import { INDICE } from "./indice-catalogo";

export function Catalogo({ children, actual }: { children?: ReactNode; actual?: string }) {
  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-5 md:grid-cols-[13rem_1fr] md:px-8">
      <aside className="top-24 self-start md:sticky">
        <div className="hidden max-h-[calc(100dvh-8rem)] overflow-y-auto py-6 md:block">
          <MenuCatalogo actual={actual} />
        </div>
        <details className="pt-6 md:hidden">
          <summary className="min-h-11 cursor-pointer py-2 font-bold">Elegir sección</summary>
          <div className="max-h-[60dvh] overflow-y-auto">
            <MenuCatalogo actual={actual} />
          </div>
        </details>
      </aside>
      <main id="contenido" tabIndex={-1} className="min-w-0">
        <h1 className="pt-10 text-4xl font-bold text-texto">
          {actual ? `${INDICE.find(([id]) => id === actual)?.[1]} · Componentes` : "Catálogo de componentes"}
        </h1>
        <p className="pt-2 text-texto-suave">
          Todo componente reutilizable de Escenara se añade aquí antes de usarse en una pantalla. Nunca se usa el
          <code className="mx-1 rounded bg-elevada px-1.5 font-mono text-sm">&lt;select&gt;</code>nativo del navegador.
        </p>
        {children ?? <p className="py-8">Elige una sección del menú. Cada componente tiene su propia página.</p>}
      </main>
    </div>
  );
}

function MenuCatalogo({ actual }: { actual?: string }) {
  return (
    <nav aria-label="Secciones del catálogo">
      <ul className="flex flex-col gap-1">
        {INDICE.map(([id, nombre]) => (
          <li key={id}>
            <Link
              href={`/admin/componentes/${id}`}
              aria-current={actual === id ? "page" : undefined}
              className="block rounded-control px-3 py-2 text-sm font-medium text-texto-suave hover:bg-elevada hover:text-texto"
            >
              {nombre}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
