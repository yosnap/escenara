"use client";

import { useState } from "react";
import { motivoRechazo, type TipoMedio, tipoDeMime } from "@/lib/media/reglas";
import type { Medio } from "@/lib/media/tipos";
import { subirMedio } from "./api-medios";
import { leerDatosReproduccion, olvidarImagen } from "./lienzo";

export interface Subida {
  id: string;
  nombre: string;
  /** Fracción de bytes enviados (0–1), medida por el navegador. */
  progreso: number;
  estado: "subiendo" | "hecha" | "error";
  error?: string;
}

export interface PendienteEditor {
  archivo: File;
  url: string;
}

/**
 * Cola de subida: valida en el navegador, abre el editor para cada imagen si está activado
 * y sube el resto directamente, con progreso real por archivo.
 */
export function useSubidaMedios({
  tipos,
  onSubido,
  documento = false,
}: {
  tipos: readonly TipoMedio[];
  onSubido: (medio: Medio) => void;
  /** Sube como documento de consentimiento: sin procesar y sin editor de imagen. */
  documento?: boolean;
}) {
  const [subidas, setSubidas] = useState<Subida[]>([]);
  const [colaEditor, setColaEditor] = useState<PendienteEditor[]>([]);
  // Un documento de consentimiento no pasa por el editor de imagen: recortarlo o girarlo es justo lo que no
  // queremos que le pase a una hoja firmada.
  const [editarAlSubir, setEditarAlSubir] = useState(!documento);

  const actualizar = (id: string, cambios: Partial<Subida>) =>
    setSubidas((lista) => lista.map((s) => (s.id === id ? { ...s, ...cambios } : s)));

  const subirUno = async (archivo: File) => {
    const id = crypto.randomUUID();
    const motivo = motivoRechazo(archivo, tipos);
    if (motivo) {
      setSubidas((lista) => [...lista, { id, nombre: archivo.name, progreso: 0, estado: "error", error: motivo }]);
      return;
    }
    setSubidas((lista) => [...lista, { id, nombre: archivo.name, progreso: 0, estado: "subiendo" }]);
    const reproduccion = await leerDatosReproduccion(archivo);
    const r = await subirMedio(archivo, reproduccion, (progreso) => actualizar(id, { progreso }), tipos, documento);
    if (r.ok) {
      actualizar(id, { estado: "hecha", progreso: 1 });
      onSubido(r.datos);
    } else {
      actualizar(id, { estado: "error", error: r.error });
    }
  };

  const agregar = (archivos: File[]) => {
    // Los GIF no pasan por el editor: el canvas perdería la animación.
    const aEditar = (a: File) =>
      editarAlSubir && tipoDeMime(a.type) === "imagen" && a.type !== "image/gif" && !motivoRechazo(a, tipos);
    const nuevos = archivos.filter(aEditar).map((archivo) => ({ archivo, url: URL.createObjectURL(archivo) }));
    if (nuevos.length > 0) setColaEditor((cola) => [...cola, ...nuevos]);
    for (const archivo of archivos) if (!aEditar(archivo)) void subirUno(archivo);
  };

  /** Termina con la imagen que está en el editor y pasa a la siguiente. */
  const siguienteEnEditor = () => {
    const actual = colaEditor[0];
    if (actual) {
      URL.revokeObjectURL(actual.url);
      olvidarImagen(actual.url);
    }
    setColaEditor((cola) => cola.slice(1));
  };

  const limpiarTerminadas = () => setSubidas((lista) => lista.filter((s) => s.estado === "subiendo"));

  return {
    subidas,
    agregar,
    subirUno,
    enEditor: colaEditor[0] ?? null,
    siguienteEnEditor,
    editarAlSubir,
    setEditarAlSubir,
    limpiarTerminadas,
  };
}
