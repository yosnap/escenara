"use client";

import { Check, Crop, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import { ETIQUETA_TIPO, formatearDuracion, formatearTamano } from "@/lib/media/reglas";
import type { Medio } from "@/lib/media/tipos";
import { BotonIcono } from "../button";
import { cn } from "../cn";
import { MiniaturaMedio } from "./miniatura-medio";

export type VistaBiblioteca = "cuadricula" | "lista";

export interface AccionesMedio {
  onEditarDatos: (medio: Medio) => void;
  onEditarImagen: (medio: Medio) => void;
  onPapelera: (medio: Medio) => void;
  onRestaurar: (medio: Medio) => void;
  onEliminar: (medio: Medio) => void;
}

function Acciones({ medio, acciones }: { medio: Medio; acciones: AccionesMedio }) {
  const clase = "size-10";
  if (medio.enPapelera) {
    return (
      <div className="flex gap-1">
        <BotonIcono
          className={clase}
          etiqueta={`Restaurar ${medio.nombre}`}
          onClick={() => acciones.onRestaurar(medio)}
        >
          <RotateCcw className="size-4" />
        </BotonIcono>
        {medio.permisos.borrarDefinitivo && (
          <BotonIcono
            className={cn(clase, "text-error")}
            etiqueta={`Eliminar definitivamente ${medio.nombre}`}
            onClick={() => acciones.onEliminar(medio)}
          >
            <X className="size-4" />
          </BotonIcono>
        )}
      </div>
    );
  }
  return (
    <div className="flex gap-1">
      <BotonIcono
        className={clase}
        etiqueta={`Editar datos de ${medio.nombre}`}
        onClick={() => acciones.onEditarDatos(medio)}
      >
        <Pencil className="size-4" />
      </BotonIcono>
      {medio.tipo === "imagen" && medio.permisos.editarImagen && (
        <BotonIcono
          className={clase}
          etiqueta={`Editar imagen ${medio.nombre}`}
          onClick={() => acciones.onEditarImagen(medio)}
        >
          <Crop className="size-4" />
        </BotonIcono>
      )}
      <BotonIcono
        className={clase}
        etiqueta={`Enviar a la papelera ${medio.nombre}`}
        onClick={() => acciones.onPapelera(medio)}
      >
        <Trash2 className="size-4" />
      </BotonIcono>
    </div>
  );
}

function Detalle({ medio }: { medio: Medio }) {
  const partes = [
    ETIQUETA_TIPO[medio.tipo],
    medio.ancho && medio.alto ? `${medio.ancho}×${medio.alto}` : null,
    medio.duracion ? formatearDuracion(medio.duracion) : null,
    formatearTamano(medio.tamano),
  ].filter(Boolean);
  return (
    <span className="truncate text-xs text-texto-suave">
      {medio.propietario && <span className="font-semibold text-texto">{medio.propietario.nombre} · </span>}
      {partes.join(" · ")}
    </span>
  );
}

/** Un medio en la biblioteca: en cuadrícula o en lista, con selección opcional y acciones. */
export function ElementoMedio({
  medio,
  vista,
  seleccionado,
  onAlternar,
  acciones,
}: {
  medio: Medio;
  vista: VistaBiblioteca;
  seleccionado: boolean;
  /** Si existe, pulsar el medio lo selecciona; si no, abre sus datos. */
  onAlternar?: (medio: Medio) => void;
  acciones: AccionesMedio;
}) {
  const pulsar = () => (onAlternar && !medio.enPapelera ? onAlternar(medio) : acciones.onEditarDatos(medio));
  const etiqueta = onAlternar
    ? `${seleccionado ? "Quitar de la selección" : "Seleccionar"} ${medio.nombre}`
    : `Ver datos de ${medio.nombre}`;
  const marca = seleccionado && (
    <span className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-acento text-sobre-acento shadow-md">
      <Check className="size-4" strokeWidth={3} aria-hidden />
    </span>
  );

  if (vista === "lista") {
    return (
      <li
        className={cn(
          "flex items-center gap-3 rounded-tarjeta border bg-superficie p-2 transition-colors duration-(--motion-fast)",
          seleccionado ? "border-acento bg-acento/8" : "border-borde/60",
        )}
      >
        <button
          type="button"
          onClick={pulsar}
          aria-pressed={onAlternar ? seleccionado : undefined}
          aria-label={etiqueta}
          className="relative size-16 shrink-0 overflow-hidden rounded-control"
        >
          <MiniaturaMedio medio={medio} />
          {marca}
        </button>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-semibold text-texto">{medio.titulo || medio.nombre}</span>
          <Detalle medio={medio} />
        </div>
        <Acciones medio={medio} acciones={acciones} />
      </li>
    );
  }

  return (
    <li
      className={cn(
        "group flex flex-col overflow-hidden rounded-tarjeta border-2 bg-superficie transition-all duration-(--motion-base)",
        seleccionado ? "border-acento shadow-lg shadow-acento/20" : "border-transparent hover:border-borde",
      )}
    >
      <button
        type="button"
        onClick={pulsar}
        aria-pressed={onAlternar ? seleccionado : undefined}
        aria-label={etiqueta}
        className="relative aspect-square overflow-hidden bg-elevada"
      >
        <MiniaturaMedio
          medio={medio}
          className="transition-transform duration-(--motion-slow) group-hover:scale-105 motion-reduce:transform-none"
        />
        {marca}
      </button>
      <div className="flex flex-col gap-1 p-2">
        <span className="truncate text-sm font-semibold text-texto">{medio.titulo || medio.nombre}</span>
        <Detalle medio={medio} />
        <div className="self-end">
          <Acciones medio={medio} acciones={acciones} />
        </div>
      </div>
    </li>
  );
}
