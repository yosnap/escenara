"use client";

import "react-image-crop/dist/ReactCrop.css";
import { Suspense, use, useCallback, useRef, useState } from "react";
import ReactCrop, { centerCrop, convertToPixelCrop, makeAspectCrop, type PercentCrop } from "react-image-crop";
import { Boton } from "../button";
import { AvisoEstado } from "../feedback";
import { CargadorChispa } from "../motion";
import { Dialogo } from "../overlay";
import { ControlesEditor } from "./controles-editor";
import { cargarImagen, dibujarOrientada, exportarRecorte, type Orientacion } from "./lienzo";
import { girar, nombreEditado } from "./transformaciones";

export type ModoGuardado = "nueva" | "sobrescribir";

export interface FuenteEditor {
  /** URL del mismo origen o `blob:` para poder leer los píxeles. */
  url: string;
  nombre: string;
  /** Si es un medio ya guardado, se ofrece sobrescribirlo. */
  puedeSobrescribir: boolean;
}

interface Props {
  fuente: FuenteEditor | null;
  onCerrar: () => void;
  onGuardar: (archivo: File, modo: ModoGuardado) => Promise<string | null>;
  /** Solo al subir: continúa con el archivo original sin editarlo. */
  onSinEditar?: () => void;
}

/** Editor de imagen: recorte con proporciones, giro, volteo y zoom. Exporta a WebP. */
export function EditorImagen({ fuente, onCerrar, onGuardar, onSinEditar }: Props) {
  return (
    <Dialogo
      abierto={fuente !== null}
      onAbiertoCambio={(abierto) => !abierto && onCerrar()}
      titulo="Editar imagen"
      descripcion="Recorta, gira o voltea la imagen. El original no se modifica hasta que guardes."
      tamano="xl"
    >
      {fuente && (
        <Suspense fallback={<CargadorChispa etiqueta="Cargando imagen" />}>
          <Carga key={fuente.url} fuente={fuente} onGuardar={onGuardar} onSinEditar={onSinEditar} />
        </Suspense>
      )}
    </Dialogo>
  );
}

const ORIENTACION_INICIAL: Orientacion = { rotacion: 0, volteoH: false, volteoV: false };

function recorteCentrado(proporcion: number, ancho: number, alto: number): PercentCrop {
  return centerCrop(makeAspectCrop({ unit: "%", width: 90 }, proporcion, ancho, alto), ancho, alto);
}

interface PropsEdicion {
  fuente: FuenteEditor;
  onGuardar: Props["onGuardar"];
  onSinEditar?: () => void;
}

function Carga(props: PropsEdicion) {
  const img = use(cargarImagen(props.fuente.url));
  if (!img) {
    return (
      <AvisoEstado
        estado="bloqueado"
        motivo="No se ha podido cargar la imagen. Cierra el editor e inténtalo de nuevo."
        accion={
          props.onSinEditar && (
            <Boton variante="secundario" tamano="sm" onClick={props.onSinEditar}>
              Subir sin editar
            </Boton>
          )
        }
      />
    );
  }
  return <EspacioEdicion {...props} img={img} />;
}

function EspacioEdicion({ fuente, onGuardar, onSinEditar, img }: PropsEdicion & { img: HTMLImageElement }) {
  const [orientacion, setOrientacion] = useState(ORIENTACION_INICIAL);
  const [proporcion, setProporcion] = useState<number | undefined>();
  const [recorte, setRecorte] = useState<PercentCrop | undefined>();
  const [zoom, setZoom] = useState(1);
  const [guardando, setGuardando] = useState<ModoGuardado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lienzo = useRef<HTMLCanvasElement | null>(null);

  // Se vuelve a dibujar cada vez que cambia la orientación (nueva función de referencia).
  const dibujar = useCallback(
    (el: HTMLCanvasElement | null) => {
      lienzo.current = el;
      if (el) dibujarOrientada(el, img, orientacion);
    },
    [img, orientacion],
  );

  const elegirProporcion = (valor: number | undefined) => {
    setProporcion(valor);
    const el = lienzo.current;
    setRecorte(valor && el ? recorteCentrado(valor, el.width, el.height) : undefined);
  };

  const girarImagen = (sentido: 1 | -1) => {
    setOrientacion((o) => ({ ...o, rotacion: girar(o.rotacion, sentido) }));
    const el = lienzo.current;
    // Tras girar 90°, el lienzo intercambia ancho y alto.
    setRecorte(proporcion && el ? recorteCentrado(proporcion, el.height, el.width) : undefined);
  };

  const restablecer = () => {
    setOrientacion(ORIENTACION_INICIAL);
    setProporcion(undefined);
    setRecorte(undefined);
    setZoom(1);
  };

  const guardar = async (modo: ModoGuardado) => {
    const el = lienzo.current;
    if (!el) return;
    setGuardando(modo);
    setError(null);
    try {
      const px = recorte ? convertToPixelCrop(recorte, el.width, el.height) : null;
      const blob = await exportarRecorte(el, px && { x: px.x, y: px.y, ancho: px.width, alto: px.height }, zoom);
      const extension = blob.type === "image/webp" ? "webp" : "png";
      const archivo = new File([blob], nombreEditado(fuente.nombre, extension), { type: blob.type });
      const fallo = await onGuardar(archivo, modo);
      if (fallo) setError(fallo);
    } catch {
      setError("No se ha podido exportar la imagen.");
    } finally {
      setGuardando(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="flex min-h-64 items-center justify-center rounded-tarjeta bg-elevada p-3">
          <ReactCrop
            crop={recorte}
            onChange={(_, porcentaje) => setRecorte(porcentaje)}
            aspect={proporcion}
            keepSelection
            ruleOfThirds
          >
            <canvas
              ref={dibujar}
              aria-label={`Vista previa de ${fuente.nombre}`}
              className="block max-h-[55dvh] max-w-full"
              style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}
            />
          </ReactCrop>
        </div>
        <ControlesEditor
          proporcion={proporcion}
          onProporcion={elegirProporcion}
          orientacion={orientacion}
          onGirar={girarImagen}
          onVoltear={(eje) => setOrientacion((o) => ({ ...o, [eje]: !o[eje] }))}
          zoom={zoom}
          onZoom={setZoom}
          onRestablecer={restablecer}
        />
      </div>

      {error && (
        <p role="alert" className="font-medium text-error">
          {error}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-3">
        {onSinEditar && (
          <Boton variante="fantasma" onClick={onSinEditar} disabled={guardando !== null}>
            Subir sin editar
          </Boton>
        )}
        {fuente.puedeSobrescribir && (
          <Boton
            variante="secundario"
            onClick={() => guardar("sobrescribir")}
            cargando={guardando === "sobrescribir"}
            disabled={guardando !== null}
          >
            Sobrescribir
          </Boton>
        )}
        <Boton onClick={() => guardar("nueva")} cargando={guardando === "nueva"} disabled={guardando !== null}>
          {onSinEditar ? "Aplicar y subir" : "Guardar como nueva"}
        </Boton>
      </div>
    </div>
  );
}
