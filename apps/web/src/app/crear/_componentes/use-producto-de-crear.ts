"use client";

import { useRef, useState } from "react";
import {
  exigeDeclaracionDeMarca,
  MENSAJE_FALTA_DECLARACION_MARCA,
  PRODUCTO_ELEGIDO_VACIO,
  type ProductoElegido,
  type ProductoResumen,
} from "@/lib/productos";

/**
 * **El producto de «Crear»**: uno solo para el fotograma y el clip. Se elige al describir la escena o en el clip, y en
 * el otro paso aparece ya elegido. Aquí vive todo lo suyo para que `vista-crear.tsx` solo lo conecte:
 *
 * - la elección y una referencia para leerla fuera del render (al refrescar los controles en el mismo gesto);
 * - si su marca hay que declararla, con el resumen que da el selector al elegir (sin volver a pedir la lista) y con
 *   lo que diga el servidor si rechaza un envío por falta de declaración;
 * - con qué producto se pidió el fotograma, para avisar en el clip si ya no coincide.
 */

/** Producto con el que se pidió el fotograma: su identificador (vacío = sin producto) y su nombre, si se sabe. */
interface ProductoDelFotograma {
  productoId: string;
  nombre: string;
}

/**
 * `true` si hay que pedir la casilla «Tengo derecho a usar esta marca». Se pide con marca declarada o sin responder;
 * también si el servidor ya ha rechazado un envío de ese producto por falta de declaración, y mientras no se sepa
 * nada de él (pedirla de más no hace daño; el servidor decide igualmente con la ficha).
 */
export function pideMarca(productoId: string, resumen: ProductoResumen | null, exigidaPorElServidor: string): boolean {
  if (productoId === "") return false;
  if (exigidaPorElServidor === productoId) return true;
  return resumen?.id === productoId ? exigeDeclaracionDeMarca(resumen.marcaVisible) : true;
}

const nombreDe = (nombre: string) => (nombre === "" ? "otro producto" : `«${nombre}»`);

/** Aviso del paso del clip cuando su producto no es el del fotograma del que sale; `null` si coinciden. */
export function avisoDeCoherencia(
  delFotograma: ProductoDelFotograma | null,
  actual: ProductoDelFotograma,
): string | null {
  if (!delFotograma || delFotograma.productoId === actual.productoId) return null;
  if (actual.productoId === "") {
    return `El fotograma se generó con ${nombreDe(delFotograma.nombre)}, pero en el clip no has elegido ningún producto: el clip anima la imagen tal cual y no recibe las fotos del producto, así que la etiqueta puede deformarse.`;
  }
  if (delFotograma.productoId === "") {
    return `El fotograma se generó sin producto y en el clip has elegido ${nombreDe(actual.nombre)}: no está en la imagen de partida, así que el modelo tendrá que añadirlo y puede no quedar bien. Para que salga desde el principio, elígelo al describir la escena y pide otro fotograma.`;
  }
  return `El fotograma se generó con ${nombreDe(delFotograma.nombre)} y en el clip has elegido ${nombreDe(actual.nombre)}: en la imagen sale el primero, así que el clip puede mezclar los dos. Para que coincidan, vuelve a elegir ${nombreDe(delFotograma.nombre)} o pide otro fotograma.`;
}

export function useProductoDeCrear({
  alCambiar,
}: {
  /**
   * Efectos de elegir otro producto (volver a evaluar los controles). `cambiaEnElFotograma` dice si cambió lo que
   * viaja con el fotograma (el producto o su acción), y no solo las fotos elegidas para el clip.
   */
  alCambiar: (producto: ProductoElegido, cambiaEnElFotograma: boolean) => Promise<void>;
}) {
  const [producto, setProducto] = useState<ProductoElegido>(PRODUCTO_ELEGIDO_VACIO);
  const [resumen, setResumen] = useState<ProductoResumen | null>(null);
  const [exigidaPorElServidor, setExigidaPorElServidor] = useState("");
  const [delFotograma, setDelFotograma] = useState<ProductoDelFotograma | null>(null);
  const vigente = useRef<ProductoElegido>(PRODUCTO_ELEGIDO_VACIO);

  /** Elige otro producto. Sin `nuevoResumen` (un cambio que no viene del selector) se conserva el que había si es el mismo. */
  const elegir = async (nuevo: ProductoElegido, nuevoResumen?: ProductoResumen | null) => {
    const anterior = vigente.current;
    const cambiaEnElFotograma = nuevo.productoId !== anterior.productoId || nuevo.accion !== anterior.accion;
    vigente.current = nuevo;
    setProducto(nuevo);
    if (nuevoResumen !== undefined) setResumen(nuevoResumen);
    else if (nuevo.productoId !== resumen?.id) setResumen(null);
    await alCambiar(nuevo, cambiaEnElFotograma);
  };

  return {
    producto,
    /** Se pide la casilla de la marca en las confirmaciones de este producto. */
    conMarca: pideMarca(producto.productoId, resumen, exigidaPorElServidor),
    elegir,
    /** Lo que se añade a la consulta de los controles del fotograma (leído en el mismo gesto, no en el render). */
    enLaConsulta: () =>
      vigente.current.productoId
        ? { productoId: vigente.current.productoId, accion: vigente.current.accion }
        : ({} as { productoId?: string; accion?: string }),
    /**
     * Si el servidor rechazó el envío por falta de declaración de marca, la casilla aparece ya: el producto pudo
     * cambiar de respuesta en otra pestaña. Devuelve `true` si era ese rechazo.
     */
    alRechazar: (mensaje: string) => {
      if (producto.productoId === "" || !mensaje.includes(MENSAJE_FALTA_DECLARACION_MARCA)) return false;
      setExigidaPorElServidor(producto.productoId);
      return true;
    },
    /** Apunta con qué producto se acaba de pedir el fotograma. */
    fotogramaPedido: () =>
      setDelFotograma({
        productoId: vigente.current.productoId,
        nombre: resumen?.id === vigente.current.productoId ? resumen.nombre : "",
      }),
    /** Aviso para el paso del clip si su producto no es el del fotograma; `null` si coinciden o no hay fotograma. */
    avisoDelClip: avisoDeCoherencia(delFotograma, {
      productoId: producto.productoId,
      nombre: resumen?.id === producto.productoId ? resumen.nombre : "",
    }),
  };
}
