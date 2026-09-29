"use client";

import { useState, useSyncExternalStore } from "react";
import { crearAlmacenCanto } from "./almacen-canto";

type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string };

export async function pedirCanto<T>(url: string, metodo = "GET", cuerpo?: unknown): Promise<Resultado<T>> {
  try {
    const respuesta = await fetch(url, {
      method: metodo,
      ...(cuerpo === undefined
        ? {}
        : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) }),
    });
    const datos = await respuesta.json().catch(() => null);
    if (!respuesta.ok) return { ok: false, error: datos?.error ?? "No se ha podido completar la operación." };
    return { ok: true, datos: datos as T };
  } catch {
    return { ok: false, error: "Sin conexión con Escenara. Comprueba tu red y recarga el estado antes de repetir." };
  }
}

/** Mantiene la vista que devuelve el servidor; el coste y los impedimentos no se calculan en el navegador. */
export function useCanto(escenaId: string) {
  const [almacen] = useState(() => crearAlmacenCanto(escenaId));
  const { canto, error, ocupado } = useSyncExternalStore(almacen.subscribe, almacen.obtener, almacen.obtener);
  return { canto, error, ocupado, cargar: almacen.cargar, elegir: almacen.audio };
}
