"use client";

import { SeccionAcciones } from "./secciones/acciones";
import { SeccionControles } from "./secciones/controles";
import { SeccionCreador } from "./secciones/creador";
import { SeccionCuentas } from "./secciones/cuentas";
import { SeccionDireccion } from "./secciones/direccion";
import { SeccionEstados } from "./secciones/estados";
import { SeccionFormularios } from "./secciones/formularios";
import { SeccionGeneracion } from "./secciones/generacion";
import { SeccionMediaPicker } from "./secciones/media-picker";
import { SeccionModelos } from "./secciones/modelos";
import { SeccionMovimiento } from "./secciones/movimiento";
import { SeccionPersonajes } from "./secciones/personajes";
import { SeccionPresets } from "./secciones/presets";
import { SeccionProyectos } from "./secciones/proyectos";
import { SeccionSecretos } from "./secciones/secretos";
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
  ["personajes", "Personajes"],
  ["presets", "Presets y prompt"],
  ["direccion", "Dirección del clip"],
  ["proyectos", "Proyectos y plan"],
  ["cuentas", "Cuentas"],
  ["secretos", "Secretos"],
  ["estados", "Estados y presupuesto"],
  ["controles", "Controles previos"],
  ["generacion", "Coste y trabajos"],
  ["modelos", "Catálogo de modelos"],
  ["superposiciones", "Diálogos y pestañas"],
  ["movimiento", "Movimiento"],
] as const;

export function Catalogo() {
  return (
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
        <h1 className="pt-10 text-4xl font-bold text-texto">Catálogo de componentes</h1>
        <p className="pt-2 text-texto-suave">
          Todo componente reutilizable de Escenara se añade aquí antes de usarse en una pantalla. Nunca se usa el
          <code className="mx-1 rounded bg-elevada px-1.5 font-mono text-sm">&lt;select&gt;</code>nativo del navegador.
        </p>
        <SeccionTokens />
        <SeccionAcciones />
        <SeccionFormularios />
        <SeccionSelectores />
        <SeccionMediaPicker />
        <SeccionCreador />
        <SeccionPersonajes />
        <SeccionPresets />
        <SeccionDireccion />
        <SeccionProyectos />
        <SeccionCuentas />
        <SeccionSecretos />
        <SeccionEstados />
        <SeccionControles />
        <SeccionGeneracion />
        <SeccionModelos />
        <SeccionSuperposiciones />
        <SeccionMovimiento />
      </main>
    </div>
  );
}
