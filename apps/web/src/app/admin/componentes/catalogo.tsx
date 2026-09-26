"use client";

import { SelectorTema } from "@/components/ui/theme-toggle";
import { SeccionAcciones } from "./secciones/acciones";
import { SeccionCreador } from "./secciones/creador";
import { SeccionEstados } from "./secciones/estados";
import { SeccionFormularios } from "./secciones/formularios";
import { SeccionMediaPicker } from "./secciones/media-picker";
import { SeccionMovimiento } from "./secciones/movimiento";
import { SeccionSelectores } from "./secciones/selectores";
import { SeccionSuperposiciones } from "./secciones/superposiciones";
import { SeccionTokens } from "./secciones/tokens";

const INDICE = [
  ["tokens", "Colores y tipografía"],
  ["acciones", "Botones"],
  ["formularios", "Campos y opciones"],
  ["selectores", "Selectores"],
  ["media-picker", "Selector de medios"],
  ["creador", "Creador"],
  ["estados", "Estados y presupuesto"],
  ["superposiciones", "Diálogos y pestañas"],
  ["movimiento", "Movimiento"],
] as const;

export function Catalogo() {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-borde/40 bg-fondo/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3 md:px-8">
          <div>
            <p className="text-xs font-bold tracking-widest text-creativo uppercase">Admin</p>
            <h1 className="text-xl font-bold text-texto">Catálogo de componentes</h1>
          </div>
          <SelectorTema />
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-8 px-5 md:grid-cols-[13rem_1fr] md:px-8">
        <nav aria-label="Secciones del catálogo" className="top-24 hidden self-start py-10 md:sticky md:block">
          <ul className="flex flex-col gap-1">
            {INDICE.map(([id, nombre]) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="block rounded-control px-3 py-2 text-sm font-medium text-texto-suave hover:bg-elevada hover:text-texto"
                >
                  {nombre}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <main>
          <p className="pt-10 text-texto-suave">
            Todo componente reutilizable de Escenara se añade aquí antes de usarse en una pantalla. Nunca se usa el
            <code className="mx-1 rounded bg-elevada px-1.5 font-mono text-sm">&lt;select&gt;</code>nativo del
            navegador.
          </p>
          <SeccionTokens />
          <SeccionAcciones />
          <SeccionFormularios />
          <SeccionSelectores />
          <SeccionMediaPicker />
          <SeccionCreador />
          <SeccionEstados />
          <SeccionSuperposiciones />
          <SeccionMovimiento />
        </main>
      </div>
    </div>
  );
}
