"use client";

import { Package, PackagePlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { EstadoVacio } from "@/components/ui/feedback";
import { MiniaturaMedio } from "@/components/ui/media/miniatura-medio";
import { NOMBRE_TIPO_PRODUCTO, type ProductoResumen } from "@/lib/productos";
import { DialogoNuevoProducto } from "./dialogo-nuevo-producto";

/**
 * Lista de productos con su miniatura, su tipo y cuántas fotos de referencia tiene. El número de fotos va a la
 * vista porque es lo que decide si el producto sirve: sin fotos el modelo no sabe qué aspecto tiene, y eso se
 * dice en la tarjeta en lugar de descubrirse al generar.
 */
export function ListaProductos({ inicial }: { inicial: ProductoResumen[] }) {
  const router = useRouter();
  const [creando, setCreando] = useState(false);

  const dialogo = (
    <DialogoNuevoProducto
      abierto={creando}
      onAbiertoCambio={setCreando}
      // Al crearlo se va a su ficha: lo siguiente es añadirle las fotos, y es ahí donde se hace.
      onCreado={(id) => router.push(`/productos/${id}`)}
    />
  );

  if (inicial.length === 0) {
    return (
      <>
        <EstadoVacio
          nivel={2}
          titulo="Todavía no tienes productos"
          texto="Un producto guarda las fotos de lo que quieres enseñar —un bote, una caja, una prenda o una app— con el papel de cada una, para que la etiqueta y el envase salgan como son."
          icono={<Package />}
          accion={
            <Boton variante="chispa" onClick={() => setCreando(true)}>
              Crear el primero
            </Boton>
          }
        />
        {dialogo}
      </>
    );
  }

  return (
    <>
      <div className="flex justify-end">
        <Boton variante="chispa" onClick={() => setCreando(true)}>
          <PackagePlus className="size-5" aria-hidden /> Nuevo producto
        </Boton>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {inicial.map((producto) => (
          <li key={producto.id}>
            <Link
              href={`/productos/${producto.id}`}
              className="flex h-full gap-4 rounded-tarjeta border-2 border-borde/60 bg-superficie p-4 transition-all duration-(--motion-base) hover:-translate-y-0.5 hover:border-acento hover:shadow-lg"
            >
              <span className="flex size-18 shrink-0 items-center justify-center overflow-hidden rounded-control border border-borde bg-elevada">
                {producto.portada ? (
                  <MiniaturaMedio medio={producto.portada} />
                ) : (
                  <Package className="size-8 text-texto-suave" aria-hidden />
                )}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <span className="truncate text-lg font-bold text-texto">{producto.nombre}</span>
                <span className="text-sm text-texto-suave">
                  {NOMBRE_TIPO_PRODUCTO[producto.tipo]} ·{" "}
                  {producto.referencias === 0
                    ? "sin fotos todavía"
                    : `${producto.referencias} ${producto.referencias === 1 ? "foto" : "fotos"}`}
                </span>
                {producto.descripcion !== "" && (
                  <span className="line-clamp-2 text-sm text-texto-suave">{producto.descripcion}</span>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {dialogo}
    </>
  );
}
