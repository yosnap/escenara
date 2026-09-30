"use client";

import { SeccionAcciones } from "./secciones/acciones";
import { SeccionAlertas } from "./secciones/alertas";
import { SeccionAnuncio } from "./secciones/anuncio";
import { SeccionCanto } from "./secciones/canto";
import { SeccionControles } from "./secciones/controles";
import { SeccionConversion } from "./secciones/conversion";
import { SeccionCreador } from "./secciones/creador";
import { SeccionCuentas } from "./secciones/cuentas";
import { SeccionDireccion } from "./secciones/direccion";
import { SeccionEstados } from "./secciones/estados";
import { SeccionFormatos } from "./secciones/formatos";
import { SeccionFormularios } from "./secciones/formularios";
import { SeccionGeneracion } from "./secciones/generacion";
import { SeccionMarca } from "./secciones/marca";
import { SeccionMediaPicker } from "./secciones/media-picker";
import { SeccionModelos } from "./secciones/modelos";
import { SeccionMontaje } from "./secciones/montaje";
import { SeccionMovimiento } from "./secciones/movimiento";
import { SeccionPasos } from "./secciones/pasos";
import { SeccionPersonajes } from "./secciones/personajes";
import { SeccionPresets } from "./secciones/presets";
import { SeccionProductos } from "./secciones/productos";
import { SeccionProyectos } from "./secciones/proyectos";
import { SeccionReparto } from "./secciones/reparto";
import { SeccionRequisitos } from "./secciones/requisitos";
import { SeccionSecretos } from "./secciones/secretos";
import { SeccionSelectores } from "./secciones/selectores";
import { SeccionSuperposiciones } from "./secciones/superposiciones";
import { SeccionTokens } from "./secciones/tokens";

const INDICE = [
  ["tokens", "Colores y tipografía"],
  ["marca", "Marca y kit"],
  ["acciones", "Botones"],
  ["formularios", "Campos y opciones"],
  ["selectores", "Selectores"],
  ["media-picker", "Selector de medios"],
  ["creador", "Creador"],
  ["personajes", "Personajes"],
  ["presets", "Presets y prompt"],
  ["direccion", "Dirección del clip"],
  ["productos", "Producto y acción"],
  ["canto", "Cantar con audio propio"],
  ["proyectos", "Proyectos y plan"],
  ["anuncio", "Estrategia del anuncio"],
  ["reparto", "Dos personajes"],
  ["montaje", "Montaje y exportación"],
  ["formatos", "Formatos, encuadre y versiones"],
  ["conversion", "De Crear a un proyecto"],
  ["cuentas", "Cuentas"],
  ["secretos", "Secretos"],
  ["alertas", "Alertas"],
  ["estados", "Estados y presupuesto"],
  ["controles", "Controles previos"],
  ["generacion", "Coste y trabajos"],
  ["modelos", "Catálogo de modelos"],
  ["superposiciones", "Diálogos y pestañas"],
  ["pasos", "Flujo por pasos"],
  ["requisitos", "Requisitos pendientes"],
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
      <main id="contenido" tabIndex={-1}>
        <h1 className="pt-10 text-4xl font-bold text-texto">Catálogo de componentes</h1>
        <p className="pt-2 text-texto-suave">
          Todo componente reutilizable de Escenara se añade aquí antes de usarse en una pantalla. Nunca se usa el
          <code className="mx-1 rounded bg-elevada px-1.5 font-mono text-sm">&lt;select&gt;</code>nativo del navegador.
        </p>
        <SeccionTokens />
        <SeccionMarca />
        <SeccionAcciones />
        <SeccionFormularios />
        <SeccionSelectores />
        <SeccionMediaPicker />
        <SeccionCreador />
        <SeccionPersonajes />
        <SeccionPresets />
        <SeccionDireccion />
        <SeccionProductos />
        <SeccionCanto />
        <SeccionProyectos />
        <SeccionAnuncio />
        <SeccionReparto />
        <SeccionMontaje />
        <SeccionFormatos />
        <SeccionConversion />
        <SeccionCuentas />
        <SeccionSecretos />
        <SeccionAlertas />
        <SeccionEstados />
        <SeccionControles />
        <SeccionGeneracion />
        <SeccionModelos />
        <SeccionSuperposiciones />
        <SeccionPasos />
        <SeccionRequisitos />
        <SeccionMovimiento />
      </main>
    </div>
  );
}
