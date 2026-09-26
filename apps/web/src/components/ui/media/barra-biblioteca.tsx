"use client";

import { LayoutGrid, List, Search, Trash2, Upload } from "lucide-react";
import { useRef } from "react";
import { aceptarArchivos, ETIQUETA_TIPO, type TipoMedio } from "@/lib/media/reglas";
import { Boton, BotonIcono } from "../button";
import { Interruptor } from "../choice";
import { cn } from "../cn";
import { EntradaTexto } from "../field";
import type { VistaBiblioteca } from "./elemento-medio";

const claseFiltro =
  "min-h-10 rounded-full px-4 text-sm font-semibold text-texto-suave transition-colors duration-(--motion-fast) hover:text-texto aria-pressed:bg-acento aria-pressed:text-sobre-acento";

export function BarraBiblioteca({
  tiposPermitidos,
  busqueda,
  onBusqueda,
  tipo,
  onTipo,
  vista,
  onVista,
  papelera,
  onPapelera,
  onArchivos,
  editarAlSubir,
  onEditarAlSubir,
}: {
  tiposPermitidos: readonly TipoMedio[];
  busqueda: string;
  onBusqueda: (texto: string) => void;
  tipo: TipoMedio | null;
  onTipo: (tipo: TipoMedio | null) => void;
  vista: VistaBiblioteca;
  onVista: (vista: VistaBiblioteca) => void;
  papelera: boolean;
  onPapelera: (activa: boolean) => void;
  onArchivos: (archivos: File[]) => void;
  editarAlSubir: boolean;
  onEditarAlSubir: (activo: boolean) => void;
}) {
  const entrada = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-texto-suave" />
          <EntradaTexto
            type="search"
            aria-label="Buscar medios por nombre, título o texto alternativo"
            placeholder="Buscar por nombre, título o texto alternativo"
            value={busqueda}
            onChange={(e) => onBusqueda(e.target.value)}
            className="pl-10"
          />
        </div>
        <Boton variante="chispa" icono={<Upload className="size-4" />} onClick={() => entrada.current?.click()}>
          Subir archivos
        </Boton>
        <input
          ref={entrada}
          type="file"
          multiple
          accept={aceptarArchivos(tiposPermitidos)}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            onArchivos(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {tiposPermitidos.length > 1 ? (
          <fieldset className="flex gap-1 rounded-full bg-elevada p-1">
            <legend className="sr-only">Filtrar por tipo</legend>
            <button type="button" aria-pressed={tipo === null} onClick={() => onTipo(null)} className={claseFiltro}>
              Todos
            </button>
            {tiposPermitidos.map((t) => (
              <button key={t} type="button" aria-pressed={tipo === t} onClick={() => onTipo(t)} className={claseFiltro}>
                {ETIQUETA_TIPO[t]}
              </button>
            ))}
          </fieldset>
        ) : (
          <span />
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div className="w-60">
            <Interruptor etiqueta="Editar imágenes al subir" activo={editarAlSubir} onCambio={onEditarAlSubir} />
          </div>
          <button
            type="button"
            aria-pressed={papelera}
            onClick={() => onPapelera(!papelera)}
            className={cn(claseFiltro, "inline-flex items-center gap-1.5 border border-borde")}
          >
            <Trash2 className="size-4" aria-hidden /> Papelera
          </button>
          <div className="flex rounded-full bg-elevada p-0.5">
            <BotonIcono
              etiqueta="Ver en cuadrícula"
              aria-pressed={vista === "cuadricula"}
              onClick={() => onVista("cuadricula")}
              className="aria-pressed:bg-superficie aria-pressed:shadow"
            >
              <LayoutGrid className="size-4" />
            </BotonIcono>
            <BotonIcono
              etiqueta="Ver en lista"
              aria-pressed={vista === "lista"}
              onClick={() => onVista("lista")}
              className="aria-pressed:bg-superficie aria-pressed:shadow"
            >
              <List className="size-4" />
            </BotonIcono>
          </div>
        </div>
      </div>
    </div>
  );
}
