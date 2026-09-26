"use client";

import { FolderOpen, UploadCloud, X } from "lucide-react";
import { type DragEvent, useRef, useState } from "react";
import {
  aceptarArchivos,
  ETIQUETA_TIPO,
  formatearTamano,
  LIMITE_BYTES,
  TIPOS_MEDIO,
  type TipoMedio,
} from "@/lib/media/reglas";
import type { Medio } from "@/lib/media/tipos";
import { Boton, BotonIcono } from "../button";
import { cn } from "../cn";
import { DialogoSelectorMedios } from "./dialogo-selector-medios";
import { EditorSubida } from "./editor-subida";
import { ListaSubidas } from "./lista-subidas";
import { MiniaturaMedio } from "./miniatura-medio";
import { useSubidaMedios } from "./use-subida-medios";

export interface SelectorMediosProps {
  etiqueta: string;
  ayuda?: string;
  valor: Medio[];
  onCambio: (medios: Medio[]) => void;
  multiple?: boolean;
  tipos?: readonly TipoMedio[];
}

/**
 * Selector de medios en línea: muestra lo elegido, permite arrastrar o subir archivos
 * (con editor de imagen opcional) y abre la biblioteca en un modal.
 */
export function SelectorMedios({
  etiqueta,
  ayuda,
  valor,
  onCambio,
  multiple = false,
  tipos = TIPOS_MEDIO,
}: SelectorMediosProps) {
  const entrada = useRef<HTMLInputElement>(null);
  const [abierto, setAbierto] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  // La cola puede terminar varias subidas seguidas: se acumulan sobre la selección más reciente.
  const actual = useRef(valor);
  actual.current = valor;

  const subida = useSubidaMedios({
    tipos,
    onSubido: (medio) => onCambio(multiple ? [...actual.current, medio] : [medio]),
  });

  const soltar = (e: DragEvent) => {
    e.preventDefault();
    setArrastrando(false);
    const archivos = Array.from(e.dataTransfer.files);
    subida.agregar(multiple ? archivos : archivos.slice(0, 1));
  };

  const limites = tipos.map((t) => `${ETIQUETA_TIPO[t].toLowerCase()} hasta ${formatearTamano(LIMITE_BYTES[t])}`);

  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-2 text-sm font-semibold text-texto">{etiqueta}</legend>

      {valor.length > 0 && (
        <ul className={cn("grid gap-3", multiple ? "grid-cols-[repeat(auto-fill,minmax(8rem,1fr))]" : "max-w-sm")}>
          {valor.map((m) => (
            <li
              key={m.id}
              className="relative aspect-square overflow-hidden rounded-tarjeta border border-borde bg-elevada"
            >
              <MiniaturaMedio medio={m} />
              <BotonIcono
                etiqueta={`Quitar ${m.nombre}`}
                onClick={() => onCambio(valor.filter((v) => v.id !== m.id))}
                className="absolute top-1.5 right-1.5 size-9 bg-black/60 text-white hover:bg-black/80"
              >
                <X className="size-4" />
              </BotonIcono>
            </li>
          ))}
        </ul>
      )}

      {(multiple || valor.length === 0) && (
        <section
          aria-label="Zona para soltar archivos"
          onDragOver={(e) => {
            e.preventDefault();
            setArrastrando(true);
          }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={soltar}
          className={cn(
            "flex flex-col items-center gap-3 rounded-tarjeta border-2 border-dashed px-6 py-8 text-center transition-colors duration-(--motion-fast)",
            arrastrando ? "border-acento bg-acento/8" : "border-borde/70",
          )}
        >
          <UploadCloud className="size-9 text-acento" aria-hidden />
          <p className="font-semibold text-texto">Arrastra aquí {multiple ? "tus archivos" : "un archivo"}</p>
          <p className="text-sm text-texto-suave">{limites.join(" · ")}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Boton
              variante="secundario"
              tamano="sm"
              icono={<UploadCloud className="size-4" />}
              onClick={() => entrada.current?.click()}
            >
              Subir desde el equipo
            </Boton>
            <Boton tamano="sm" icono={<FolderOpen className="size-4" />} onClick={() => setAbierto(true)}>
              Elegir de la biblioteca
            </Boton>
          </div>
        </section>
      )}

      {!multiple && valor.length > 0 && (
        <Boton variante="secundario" tamano="sm" className="self-start" onClick={() => setAbierto(true)}>
          Cambiar
        </Boton>
      )}

      <input
        ref={entrada}
        type="file"
        multiple={multiple}
        accept={aceptarArchivos(tipos)}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          subida.agregar(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />

      {ayuda && <p className="text-sm text-texto-suave">{ayuda}</p>}
      <ListaSubidas subidas={subida.subidas} onLimpiar={subida.limpiarTerminadas} />
      <EditorSubida subida={subida} />

      <DialogoSelectorMedios
        abierto={abierto}
        onAbiertoCambio={setAbierto}
        multiple={multiple}
        tipos={tipos}
        inicial={valor}
        onConfirmar={(medios) => {
          onCambio(medios);
          setAbierto(false);
        }}
      />
    </fieldset>
  );
}
