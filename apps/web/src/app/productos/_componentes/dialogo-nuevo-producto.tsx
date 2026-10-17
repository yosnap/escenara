"use client";

import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { Aviso } from "@/components/ui/feedback";
import { AreaTexto, Campo, EntradaTexto } from "@/components/ui/field";
import { Dialogo } from "@/components/ui/overlay";
import { crearProducto } from "@/components/ui/productos/api-productos";
import { PreguntaMarca } from "@/components/ui/productos/pregunta-marca";
import { Selector } from "@/components/ui/select";
import {
  AYUDA_DESCRIPCION_PRODUCTO,
  DESCRIPCION_PRODUCTO_MAXIMA,
  DESCRIPCION_TIPO_PRODUCTO,
  NOMBRE_PRODUCTO_MAXIMO,
  NOMBRE_TIPO_PRODUCTO,
  TIPOS_PRODUCTO,
  type TipoProducto,
} from "@/lib/productos";

/**
 * Alta de un producto. Nace **sin fotos** a propósito: elegirlas es lo que se hace en su ficha, con la
 * biblioteca entera delante y diciendo el papel de cada una. Pedirlo todo aquí obligaría a meter media
 * biblioteca dentro de un diálogo.
 *
 * Si se ve una marca se responde al crear, y es obligatorio: con marca, cada vídeo pide la declaración «Tengo derecho
 * a usar esta marca» y se avisa del filtro del proveedor; sin marca, no se pide nada.
 */
export function DialogoNuevoProducto({
  abierto,
  onAbiertoCambio,
  onCreado,
}: {
  abierto: boolean;
  onAbiertoCambio: (abierto: boolean) => void;
  onCreado: (id: string) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [tipo, setTipo] = useState<TipoProducto>("fisico");
  // Sin responder hasta que se elige: la respuesta es obligatoria.
  const [marcaVisible, setMarcaVisible] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const crear = async () => {
    if (marcaVisible === null) return;
    setGuardando(true);
    setError("");
    const resultado = await crearProducto({ nombre, descripcion, tipo, marcaVisible });
    setGuardando(false);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    onCreado(resultado.datos.id);
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoCambio={onAbiertoCambio}
      titulo="Nuevo producto"
      descripcion="Dale un nombre y descríbelo en una frase. Las fotos se añaden después, en su ficha."
      pie={
        <>
          <Boton variante="secundario" onClick={() => onAbiertoCambio(false)} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton
            variante="chispa"
            onClick={crear}
            disabled={guardando || nombre.trim() === "" || marcaVisible === null}
          >
            {guardando ? "Creando…" : "Crear producto"}
          </Boton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Campo etiqueta="Nombre">
          {(props) => (
            <EntradaTexto
              {...props}
              value={nombre}
              maxLength={NOMBRE_PRODUCTO_MAXIMO}
              disabled={guardando}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Crema de noche Aurora"
            />
          )}
        </Campo>

        <Campo etiqueta="Descripción corta (en español)" ayuda={AYUDA_DESCRIPCION_PRODUCTO}>
          {(props) => (
            <AreaTexto
              {...props}
              value={descripcion}
              maxLength={DESCRIPCION_PRODUCTO_MAXIMA}
              disabled={guardando}
              className="min-h-20"
              onChange={(e) => setDescripcion(e.target.value)}
            />
          )}
        </Campo>

        <Selector
          etiqueta="Tipo"
          valor={tipo}
          deshabilitado={guardando}
          opciones={TIPOS_PRODUCTO.map((t) => ({
            value: t,
            label: NOMBRE_TIPO_PRODUCTO[t],
            descripcion: DESCRIPCION_TIPO_PRODUCTO[t],
          }))}
          onCambio={(v) => v && setTipo(v as TipoProducto)}
        />

        <PreguntaMarca valor={marcaVisible} onCambio={setMarcaVisible} />

        {error !== "" && <Aviso tono="error">{error}</Aviso>}
      </div>
    </Dialogo>
  );
}
