"use client";

import { Copy, Plus } from "lucide-react";
import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { Aviso } from "@/components/ui/feedback";
import { AreaTexto, Campo, EntradaTexto } from "@/components/ui/field";
import { Dialogo } from "@/components/ui/overlay";
import { Selector } from "@/components/ui/select";
import {
  AVISO_OFERTA_INCOMPLETA,
  AYUDA_BONUS,
  AYUDA_GARANTIA,
  AYUDA_PRECIO,
  AYUDA_QUE_SE_DA,
  AYUDA_URGENCIA,
  BONUS_MAXIMO,
  GARANTIA_MAXIMA,
  type OfertaVista,
  PRECIO_MAXIMO,
  QUE_SE_DA_MAXIMO,
  URGENCIA_MAXIMA,
} from "@/lib/anuncio";
import { crearOferta, duplicarOferta, editarOferta } from "./api-anuncio";

/**
 * **La oferta del brief**: elegir una de las que ya tienes, crear una nueva o **duplicar** una a otro producto.
 *
 * La oferta va atada a un producto (decisión del propietario, 2026-09-28) y es reutilizable: la misma sirve para
 * las doce variantes de ángulo y se edita en un solo sitio. Por eso aquí solo se ofrecen las del producto del
 * brief: una oferta de otro producto en este anuncio prometería algo que no es lo que se enseña.
 *
 * Solo «qué se le da» es obligatorio. Los cuatro opcionales vacíos **no aparecen** en el guion, y se dice al lado
 * en lugar de dejarlo a la intuición.
 */

interface Campos {
  queSeDa: string;
  precio: string;
  garantia: string;
  urgencia: string;
  bonus: string;
}

const VACIOS: Campos = { queSeDa: "", precio: "", garantia: "", urgencia: "", bonus: "" };

const deOferta = (oferta: OfertaVista): Campos => ({
  queSeDa: oferta.queSeDa,
  precio: oferta.precio,
  garantia: oferta.garantia,
  urgencia: oferta.urgencia,
  bonus: oferta.bonus,
});

export function EditorDeOferta({
  ofertas,
  productos,
  productoId,
  ofertaId,
  deshabilitado,
  onElegir,
  onOfertas,
  onError,
}: {
  /** Todas las ofertas propias. Aquí se filtran por el producto del brief. */
  ofertas: readonly OfertaVista[];
  productos: readonly { id: string; nombre: string }[];
  /** Producto del brief; vacío = todavía no se ha dicho de qué producto es el anuncio. */
  productoId: string;
  ofertaId: string | null;
  deshabilitado?: boolean;
  /** Elige (o desata) la oferta del brief. */
  onElegir: (ofertaId: string | null) => void;
  /** La lista de ofertas ha cambiado: crear, editar o duplicar la devuelve entera para no recargar la página. */
  onOfertas: (ofertas: OfertaVista[]) => void;
  onError: (mensaje: string) => void;
}) {
  const [campos, setCampos] = useState<Campos>(VACIOS);
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<OfertaVista | null>(null);
  const [duplicando, setDuplicando] = useState<OfertaVista | null>(null);
  const [destino, setDestino] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const delProducto = ofertas.filter((o) => o.productoId === productoId);
  const elegida = ofertas.find((o) => o.id === ofertaId) ?? null;

  /** Sustituye una oferta en la lista, o la añade si es nueva. Así no hay que recargar para verla. */
  const conOferta = (oferta: OfertaVista): OfertaVista[] =>
    ofertas.some((o) => o.id === oferta.id)
      ? ofertas.map((o) => (o.id === oferta.id ? oferta : o))
      : [oferta, ...ofertas];

  const crear = async () => {
    setGuardando(true);
    const resultado = await crearOferta({ productoId, ...campos });
    setGuardando(false);
    if (!resultado.ok) {
      onError(resultado.error);
      return;
    }
    onOfertas(conOferta(resultado.datos));
    // Recién creada se ata al brief: es lo que venía a hacer quien la crea desde aquí.
    onElegir(resultado.datos.id);
    setCreando(false);
    setCampos(VACIOS);
  };

  const editar = async () => {
    if (editando === null) return;
    setGuardando(true);
    const resultado = await editarOferta(editando.id, { ...campos });
    setGuardando(false);
    if (!resultado.ok) {
      onError(resultado.error);
      return;
    }
    onOfertas(conOferta(resultado.datos));
    setEditando(null);
  };

  const duplicar = async () => {
    if (duplicando === null || destino === null) return;
    setGuardando(true);
    const resultado = await duplicarOferta(duplicando.id, destino);
    setGuardando(false);
    if (!resultado.ok) {
      onError(resultado.error);
      return;
    }
    onOfertas(conOferta(resultado.datos));
    setDuplicando(null);
    setDestino(null);
  };

  if (productoId === "") {
    return (
      <p className="text-texto-suave">
        Elige antes de qué producto es el anuncio: la oferta va atada a un producto, para que lo que se promete sea lo
        que se enseña.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Selector
        etiqueta="Oferta de este anuncio"
        marcador={delProducto.length === 0 ? "Todavía no hay ninguna de este producto" : "Elige una oferta"}
        deshabilitado={deshabilitado || delProducto.length === 0}
        valor={ofertaId ?? ""}
        opciones={[
          { value: "", label: "Sin oferta todavía" },
          ...delProducto.map((o) => ({ value: o.id, label: o.queSeDa, descripcion: o.precio })),
        ]}
        onCambio={(v) => onElegir(v === null || v === "" ? null : v)}
      />

      <div className="flex flex-wrap gap-2">
        <Boton
          variante="secundario"
          tamano="sm"
          disabled={deshabilitado}
          icono={<Plus className="size-4" />}
          onClick={() => {
            setCampos(VACIOS);
            setCreando(true);
          }}
        >
          Crear una oferta
        </Boton>
        {elegida !== null && (
          <>
            <Boton
              variante="secundario"
              tamano="sm"
              disabled={deshabilitado}
              onClick={() => {
                setCampos(deOferta(elegida));
                setEditando(elegida);
              }}
            >
              Editar esta oferta
            </Boton>
            <Boton
              variante="secundario"
              tamano="sm"
              disabled={deshabilitado || productos.length < 2}
              icono={<Copy className="size-4" />}
              onClick={() => {
                setDestino(null);
                setDuplicando(elegida);
              }}
            >
              Duplicar a otro producto
            </Boton>
          </>
        )}
      </div>
      {elegida !== null && productos.length < 2 && (
        <p className="text-sm text-texto-suave">
          Para duplicar una oferta necesitas otro producto al que atarla: créalo antes en «Productos».
        </p>
      )}

      <Dialogo
        abierto={creando || editando !== null}
        onAbiertoCambio={(abierto) => {
          if (abierto) return;
          setCreando(false);
          setEditando(null);
        }}
        titulo={editando === null ? "Crear una oferta" : `Editar «${editando.queSeDa}»`}
        descripcion="Solo «qué se le da» es obligatorio. Lo que dejes vacío no se dirá en el guion."
      >
        <div className="flex flex-col gap-4">
          <Campo etiqueta="Qué se le da (obligatorio)" ayuda={AYUDA_QUE_SE_DA}>
            {(p) => (
              <AreaTexto
                {...p}
                value={campos.queSeDa}
                maxLength={QUE_SE_DA_MAXIMO}
                className="min-h-20"
                onChange={(e) => setCampos({ ...campos, queSeDa: e.target.value })}
              />
            )}
          </Campo>
          <Campo etiqueta="Precio" ayuda={AYUDA_PRECIO}>
            {(p) => (
              <EntradaTexto
                {...p}
                value={campos.precio}
                maxLength={PRECIO_MAXIMO}
                onChange={(e) => setCampos({ ...campos, precio: e.target.value })}
              />
            )}
          </Campo>
          <Campo etiqueta="Garantía" ayuda={AYUDA_GARANTIA}>
            {(p) => (
              <EntradaTexto
                {...p}
                value={campos.garantia}
                maxLength={GARANTIA_MAXIMA}
                onChange={(e) => setCampos({ ...campos, garantia: e.target.value })}
              />
            )}
          </Campo>
          <Campo etiqueta="Urgencia" ayuda={AYUDA_URGENCIA}>
            {(p) => (
              <EntradaTexto
                {...p}
                value={campos.urgencia}
                maxLength={URGENCIA_MAXIMA}
                onChange={(e) => setCampos({ ...campos, urgencia: e.target.value })}
              />
            )}
          </Campo>
          <Campo etiqueta="Regalo incluido" ayuda={AYUDA_BONUS}>
            {(p) => (
              <EntradaTexto
                {...p}
                value={campos.bonus}
                maxLength={BONUS_MAXIMO}
                onChange={(e) => setCampos({ ...campos, bonus: e.target.value })}
              />
            )}
          </Campo>
          <Aviso tono="info">{AVISO_OFERTA_INCOMPLETA}</Aviso>
          <div className="flex flex-wrap justify-end gap-2">
            <Boton
              variante="fantasma"
              onClick={() => {
                setCreando(false);
                setEditando(null);
              }}
            >
              Cancelar
            </Boton>
            <Boton
              cargando={guardando}
              disabled={campos.queSeDa.trim() === ""}
              onClick={() => (editando === null ? crear() : editar())}
            >
              {editando === null ? "Crear la oferta" : "Guardar la oferta"}
            </Boton>
          </div>
        </div>
      </Dialogo>

      <Dialogo
        abierto={duplicando !== null}
        onAbiertoCambio={(abierto) => {
          if (!abierto) setDuplicando(null);
        }}
        titulo="Duplicar la oferta a otro producto"
        descripcion="Se crea una copia atada al producto que elijas. La original no se toca: su anuncio sigue vivo."
      >
        <div className="flex flex-col gap-4">
          <Selector
            etiqueta="Producto de la copia"
            marcador="Elige el producto"
            valor={destino ?? ""}
            opciones={productos
              .filter((p) => p.id !== duplicando?.productoId)
              .map((p) => ({ value: p.id, label: p.nombre }))}
            onCambio={setDestino}
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Boton variante="fantasma" onClick={() => setDuplicando(null)}>
              Cancelar
            </Boton>
            <Boton cargando={guardando} disabled={destino === null} onClick={duplicar}>
              Duplicar
            </Boton>
          </div>
        </div>
      </Dialogo>
    </div>
  );
}
