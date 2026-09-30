"use client";

import { Package } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { OpcionDireccion } from "@/lib/direccion";
import type { FotoDeProductoDelClip } from "@/lib/foto-de-producto";
import type { CupoDeFotos } from "@/lib/fotos-del-producto";
import {
  AVISO_ACCION_POCO_FIABLE,
  AVISO_GUION_EN_ACCION_SIN_HABLA,
  AVISO_PRODUCTO_SIN_ACCION,
  DESCRIPCION_PASO_DIGITAL,
  DESCRIPCION_PASO_DIGITAL_ANIMAR,
  esAccionPocoFiable,
  esAccionSinHabla,
  NOMBRE_PASO_DIGITAL,
  PASO_DIGITAL_ANIMAR,
  PASOS_PRODUCTO_DIGITAL,
  PRODUCTO_SIN_FOTOS,
  type ProductoElegido,
  type ProductoResumen,
} from "@/lib/productos";
import { CabeceraGrupo } from "../direccion/cabecera-grupo";
import { Aviso } from "../feedback";
import { MiniaturaMedio } from "../media/miniatura-medio";
import { Selector } from "../select";
import { listarProductos } from "./api-productos";
import { AvisoFotoDeProducto } from "./aviso-foto-de-producto";
import { ElectorAccionProducto } from "./elector-accion-producto";
import { FotosQueViajan } from "./elector-fotos-producto";
import { DefinicionesPictogramaProducto } from "./pictogramas-producto";

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
  fotoDeProducto,
  elegirFotos,
  deshabilitado,
  onCambio,
}: {
  producto: ProductoElegido;
  /** Catálogo de acciones, tal como llega con el resto de la dirección. */
  acciones: OpcionDireccion[];
  /**
   * Cómo está el modelo del clip respecto a la foto del producto (lo calcula el servidor). Si no la admite, el aviso
   * sale aquí, junto a la elección, y no solo con el coste al final. No sustituye al control previo: lo adelanta.
   */
  fotoDeProducto?: FotoDeProductoDelClip | null;
  /**
   * Con qué se produce el clip, para saber cuántas fotos del producto caben. **Solo lo pasa quien puede guardar
   * la elección de fotos** («Crear» y la escena de un proyecto); sin él no se ofrece elegir, porque una
   * elección que no se guarda engañaría.
   */
  elegirFotos?: CupoDeFotos | null;
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
  return (
    <section className="flex flex-col gap-8 rounded-tarjeta border border-borde bg-superficie/60 p-5">
      <DefinicionesPictogramaProducto />
      <CabeceraGrupo
        como="h5"
        icono={Package}
        titulo="El producto"
        descripcion="El producto que sale en el clip y qué hace el personaje con él."
        tono="producto"
      />

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

      {elegido && <AvisoFotoDeProducto foto={fotoDeProducto} referencias={elegido.fotosVigentes} />}

      {elegido && elegirFotos && elegido.fotosVigentes > 0 && (
        <FotosQueViajan
          productoId={elegido.id}
          nombre={elegido.nombre}
          accion={producto.accion}
          cupo={elegirFotos}
          elegidas={producto.fotos}
          deshabilitado={deshabilitado}
          onCambio={(fotos) => {
            const { fotos: _anteriores, ...sinFotos } = producto;
            onCambio(fotos ? { ...sinFotos, fotos } : sinFotos);
          }}
        />
      )}

      {elegido?.tipo === "digital" && <PasosDelProductoDigital />}

      {producto.productoId !== "" && (
        <>
          <ElectorAccionProducto
            acciones={acciones}
            accion={producto.accion}
            deshabilitado={deshabilitado}
            onCambio={(accion) => onCambio({ ...producto, accion })}
          />
          {producto.accion === "" && <Aviso tono="info">{AVISO_PRODUCTO_SIN_ACCION}</Aviso>}
          {esAccionPocoFiable(producto.accion) && <Aviso tono="info">{AVISO_ACCION_POCO_FIABLE}</Aviso>}
          {esAccionSinHabla(producto.accion) && <Aviso tono="info">{AVISO_GUION_EN_ACCION_SIN_HABLA}</Aviso>}
        </>
      )}
    </section>
  );
}

/**
 * **Los dos pasos del producto digital**, a la vista antes de empezar: cada uno es una generación que se
 * estima y se paga aparte, y enterarse del segundo cobro después de pagar el primero sería justo lo que la
 * norma de errores visibles prohíbe.
 */
function PasosDelProductoDigital() {
  return (
    <div className="flex flex-col gap-2 rounded-tarjeta border border-borde bg-fondo/60 p-3">
      <p className="text-sm font-semibold text-texto">Un producto digital se hace en tres pasos</p>
      <ol className="flex flex-col gap-2">
        {PASOS_PRODUCTO_DIGITAL.map((paso) => (
          <li key={paso} className="text-sm text-texto-suave">
            <span className="font-semibold text-texto">{NOMBRE_PASO_DIGITAL[paso]}</span>{" "}
            {DESCRIPCION_PASO_DIGITAL[paso]}
          </li>
        ))}
        <li className="text-sm text-texto-suave">
          <span className="font-semibold text-texto">{PASO_DIGITAL_ANIMAR}</span> {DESCRIPCION_PASO_DIGITAL_ANIMAR}
        </li>
      </ol>
      <p className="text-sm text-texto-suave">
        Los dos primeros son dos generaciones distintas: cada una te dice lo que cuesta y la confirmas tú.
      </p>
    </div>
  );
}
