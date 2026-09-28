"use client";

import { Package } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { OpcionDireccion } from "@/lib/direccion";
import {
  AVISO_PRODUCTO_SIN_ACCION,
  AYUDA_ACCION_PRODUCTO,
  PRODUCTO_SIN_FOTOS,
  type ProductoElegido,
  type ProductoResumen,
} from "@/lib/productos";
import { ElectorVisual, type OpcionVisual } from "../direccion/elector-visual";
import { Aviso } from "../feedback";
import { MiniaturaMedio } from "../media/miniatura-medio";
import { Selector } from "../select";
import { listarProductos } from "./api-productos";
import {
  DefinicionesPictogramaProducto,
  fraseDeAccionProducto,
  PictogramaProducto,
  PictogramaSinProducto,
} from "./pictogramas-producto";

/**
 * **Elegir producto y acción** (0.26.0). Va dentro del panel de dirección, que es el único sitio donde se
 * dirige un clip, así que los dos sitios que dirigen —«Crear» y la escena de un proyecto— lo tienen sin
 * duplicar ni un control.
 *
 * Reglas de la casa que cumple:
 *
 * - **no es un `<select>` nativo**: el producto va con el `Selector` del catálogo y la acción con el elector
 *   visual de tarjetas, el mismo de la dirección;
 * - **sin bordes laterales de color**;
 * - cada acción lleva **pictograma y frase llana**, porque «enseñarlo a cámara» y «sostenerlo» suenan igual y
 *   no lo son;
 * - **se dice lo que falta con su causa**: sin productos, adónde ir a crearlos; con un producto sin fotos, que
 *   el modelo no sabe qué aspecto tiene; con producto y sin acción, qué va a pasar si no se elige.
 *
 * La lista se lee una vez al montar. No cuesta nada y no genera nada: es una consulta a filas propias.
 */
export function SelectorProducto({
  producto,
  acciones,
  deshabilitado,
  onCambio,
}: {
  producto: ProductoElegido;
  /** Catálogo de acciones, tal como llega con el resto de la dirección. */
  acciones: OpcionDireccion[];
  deshabilitado?: boolean;
  onCambio: (elegido: ProductoElegido) => void;
}) {
  const [productos, setProductos] = useState<ProductoResumen[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let vigente = true;
    listarProductos().then((r) => {
      if (!vigente) return;
      if (r.ok) setProductos(r.datos);
      // El motivo concreto, no un «no se ha podido»: sin la lista no se puede elegir y hay que saber por qué.
      else setError(`No se han podido cargar tus productos: ${r.error}`);
    });
    return () => {
      vigente = false;
    };
  }, []);

  const elegido = productos?.find((p) => p.id === producto.productoId) ?? null;
  const tarjetas: OpcionVisual[] = [
    {
      valor: "",
      nombre: "Sin elegir",
      frase: "Lo decide el modelo: puede salir en la mano, en la mesa o fuera de plano.",
      pictograma: <PictogramaSinProducto />,
    },
    ...acciones.map((a) => ({
      valor: a.clave,
      nombre: a.nombre,
      frase: fraseDeAccionProducto(a.clave),
      descripcion: a.descripcion,
      pictograma: <PictogramaProducto clave={a.clave} />,
    })),
  ];

  return (
    <section className="flex flex-col gap-3 rounded-tarjeta border border-borde bg-superficie/60 p-4">
      <DefinicionesPictogramaProducto />
      <h5 className="flex items-center gap-2 font-semibold text-texto">
        <Package className="size-5 text-acento" aria-hidden />
        El producto
      </h5>

      {error !== "" && <Aviso tono="error">{error}</Aviso>}

      {productos !== null && productos.length === 0 ? (
        <p className="text-sm text-texto-suave">
          Todavía no tienes ningún producto.{" "}
          <Link href="/productos" className="font-semibold text-acento underline">
            Crea uno en «Productos»
          </Link>{" "}
          con sus fotos y podrás elegirlo aquí.
        </p>
      ) : (
        <Selector
          etiqueta="Producto"
          valor={producto.productoId}
          deshabilitado={deshabilitado || productos === null}
          opciones={[
            { value: "", label: "Ninguno" },
            ...(productos ?? []).map((p) => ({ value: p.id, label: p.nombre, descripcion: p.descripcion })),
          ]}
          onCambio={(v) => {
            const id = v ?? "";
            // Quitar el producto se lleva la acción: una acción sin producto no describe nada.
            onCambio(id === "" ? { productoId: "", accion: "" } : { productoId: id, accion: producto.accion });
          }}
        />
      )}

      {elegido && (
        <div className="flex items-center gap-3">
          {elegido.portada && (
            <span className="block size-14 shrink-0 overflow-hidden rounded-control border border-borde">
              <MiniaturaMedio medio={elegido.portada} />
            </span>
          )}
          <p className="text-sm text-texto-suave">
            {elegido.referencias === 0
              ? PRODUCTO_SIN_FOTOS
              : `${elegido.referencias} ${elegido.referencias === 1 ? "foto de referencia" : "fotos de referencia"}.`}
          </p>
        </div>
      )}

      {producto.productoId !== "" && (
        <>
          <ElectorVisual
            etiqueta="Qué se hace con él"
            ayuda={AYUDA_ACCION_PRODUCTO}
            valor={producto.accion}
            deshabilitado={deshabilitado}
            opciones={tarjetas}
            onCambio={(v) => onCambio({ ...producto, accion: v })}
          />
          {producto.accion === "" && <Aviso tono="info">{AVISO_PRODUCTO_SIN_ACCION}</Aviso>}
        </>
      )}
    </section>
  );
}
