"use client";

import { useEffect, useState } from "react";
import { listarProductos } from "@/components/ui/productos/api-productos";
import type { ProductoResumen } from "@/lib/productos";

/**
 * `true` si hay que pedir la casilla «Tengo derecho a usar esta marca» para el producto elegido.
 *
 * Solo se pide cuando el producto tiene marca declarada (`marcaVisible`). Mientras no se sabe —la lista aún no ha
 * llegado o no se ha podido leer— se pide: pedirla de más no hace daño y el servidor decide igualmente con la ficha.
 */
export function pideMarca(productoId: string, productos: readonly ProductoResumen[] | null): boolean {
  if (productoId === "") return false;
  const elegido = productos?.find((p) => p.id === productoId);
  return elegido ? elegido.marcaVisible : true;
}

/**
 * Lee tus productos la primera vez que eliges uno, para saber si su marca hay que declararla. Es una lectura de filas
 * propias: no cuesta nada ni genera nada.
 */
export function useMarcaDelProducto(productoId: string): boolean {
  const [productos, setProductos] = useState<ProductoResumen[] | null>(null);
  const hayProducto = productoId !== "";
  useEffect(() => {
    if (!hayProducto || productos !== null) return;
    let vigente = true;
    listarProductos().then((r) => {
      // Si falla, se queda sin lista y la casilla se sigue pidiendo: es el lado seguro.
      if (vigente && r.ok) setProductos(r.datos);
    });
    return () => {
      vigente = false;
    };
  }, [hayProducto, productos]);
  return pideMarca(productoId, productos);
}
