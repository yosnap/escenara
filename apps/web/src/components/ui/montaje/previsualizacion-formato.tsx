"use client";

import { type KeyboardEvent, type PointerEvent, type ReactNode, useRef } from "react";
import { cn } from "@/components/ui/cn";
import {
  type Encuadre,
  type FormatoMontaje,
  PLATAFORMA_DE_FORMATO,
  RESOLUCION_MONTAJE,
  ZONA_SEGURA_DE_FORMATO,
} from "@/lib/formatos";
import type { PosicionEtiqueta } from "@/lib/montaje";
import { TEXTO_ETIQUETA_SINTETICA } from "@/lib/montaje";

/** Paso de las flechas del teclado al mover el encuadre, en puntos de 0 a 100. */
const PASO_TECLADO = 5;

const acotar = (v: number) => Math.round(Math.min(100, Math.max(0, v)));

/**
 * Marco de un formato de salida (9:16, 4:5, 1:1 o 16:9) con sus **zonas seguras** dibujadas y el clip colocado
 * **como saldrá en el MP4**.
 *
 * La previsualización usa la misma cuenta que el render: con `recorte`, el vídeo llena el marco (`object-cover`) y
 * `object-position` es la misma fracción del sobrante que usa `crop` en FFmpeg, así que lo que se ve es lo que se
 * exporta. Con `bandas`, cabe entero (`object-contain`) sobre negro.
 *
 * Con `onEncuadre`, el recorte **se arrastra** con el ratón o el dedo, y se mueve con las flechas del teclado. Sin
 * las medidas del clip no se puede saber cuánto sobra, así que entonces solo quedan los atajos del control.
 *
 * Sin bordes laterales de color (norma del sistema de diseño): las franjas se marcan con trama discontinua.
 */
export function PrevisualizacionFormato({
  formato,
  src,
  poster,
  medidas,
  encuadre,
  onEncuadre,
  vacio,
  etiqueta,
  pie,
  className,
  children,
}: {
  formato: FormatoMontaje;
  /** El clip que se previsualiza. Sin `src` se pinta el marco con su explicación. */
  src?: string;
  poster?: string;
  /** Medidas del clip. Hacen falta para arrastrar: dicen cuánto sobra por cada lado. */
  medidas?: { ancho: number | null; alto: number | null };
  /** Cómo entra el clip. Sin él, llena el marco centrado (la previsualización de siempre). */
  encuadre?: Encuadre;
  /** Si llega, el recorte se puede arrastrar y mover con el teclado. */
  onEncuadre?: (encuadre: Encuadre) => void;
  vacio?: string;
  /** Dónde se vería la etiqueta de contenido sintético, o `null` para no pintarla. */
  etiqueta?: PosicionEtiqueta | null;
  pie?: ReactNode;
  className?: string;
  /** Lo que se superpone al vídeo (un subtítulo de muestra, por ejemplo). */
  children?: ReactNode;
}) {
  const marco = useRef<HTMLDivElement>(null);
  const arrastre = useRef<{ x: number; y: number; desdeX: number; desdeY: number } | null>(null);
  const { ancho, alto } = RESOLUCION_MONTAJE[formato];
  const zona = ZONA_SEGURA_DE_FORMATO[formato];
  const modo = encuadre?.modo ?? "recorte";
  const x = encuadre?.modo === "recorte" ? encuadre.x : 50;
  const y = encuadre?.modo === "recorte" ? encuadre.y : 50;
  const arrastrable = Boolean(onEncuadre && src && modo === "recorte");

  /** Píxeles que sobran del clip por cada eje dentro del marco, con el clip escalado para llenarlo. */
  const sobrante = (): { x: number; y: number } | null => {
    const caja = marco.current?.getBoundingClientRect();
    if (!caja || !medidas?.ancho || !medidas.alto) return null;
    const escala = Math.max(caja.width / medidas.ancho, caja.height / medidas.alto);
    return { x: medidas.ancho * escala - caja.width, y: medidas.alto * escala - caja.height };
  };

  const alBajar = (e: PointerEvent<HTMLButtonElement>) => {
    if (!arrastrable) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    arrastre.current = { x, y, desdeX: e.clientX, desdeY: e.clientY };
  };

  const alMover = (e: PointerEvent<HTMLButtonElement>) => {
    const inicio = arrastre.current;
    const resto = sobrante();
    if (!inicio || !resto || !onEncuadre) return;
    // Arrastrar el vídeo hacia la derecha descubre su parte izquierda: la posición baja.
    const nuevoX = resto.x > 0.5 ? acotar(inicio.x - ((e.clientX - inicio.desdeX) / resto.x) * 100) : inicio.x;
    const nuevoY = resto.y > 0.5 ? acotar(inicio.y - ((e.clientY - inicio.desdeY) / resto.y) * 100) : inicio.y;
    if (nuevoX !== x || nuevoY !== y) onEncuadre({ modo: "recorte", x: nuevoX, y: nuevoY });
  };

  const alSoltar = () => {
    arrastre.current = null;
  };

  const alTeclear = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!onEncuadre || modo !== "recorte") return;
    const cambios: Record<string, [number, number]> = {
      ArrowLeft: [-PASO_TECLADO, 0],
      ArrowRight: [PASO_TECLADO, 0],
      ArrowUp: [0, -PASO_TECLADO],
      ArrowDown: [0, PASO_TECLADO],
    };
    const cambio = cambios[e.key];
    if (!cambio) return;
    e.preventDefault();
    onEncuadre({ modo: "recorte", x: acotar(x + cambio[0]), y: acotar(y + cambio[1]) });
  };

  return (
    <figure className={cn("flex flex-col gap-2", className)}>
      <div
        ref={marco}
        className="relative w-full overflow-hidden rounded-tarjeta border-2 border-borde bg-black"
        style={{ aspectRatio: `${ancho} / ${alto}` }}
      >
        {src ? (
          // biome-ignore lint/a11y/useMediaCaption: es la previsualización del clip que ya se está montando
          <video
            // `#t=0.1` hace que el navegador pinte un fotograma aunque no se reproduzca: es lo que se encuadra.
            src={arrastrable ? `${src}#t=0.1` : src}
            poster={poster}
            muted
            playsInline
            preload="metadata"
            controls={!onEncuadre}
            className={cn("size-full", modo === "bandas" ? "object-contain" : "object-cover")}
            style={modo === "recorte" ? { objectPosition: `${x}% ${y}%` } : undefined}
          />
        ) : (
          <p className="flex size-full items-center justify-center bg-elevada p-3 text-center text-xs text-texto-suave">
            {vacio ?? "Cuando esta escena tenga su clip, se verá aquí."}
          </p>
        )}
        {arrastrable && (
          <button
            type="button"
            aria-label={`Encuadre en ${PLATAFORMA_DE_FORMATO[formato]}: arrastra el vídeo o usa las flechas. Horizontal ${x} %, vertical ${y} %.`}
            className="absolute inset-0 cursor-grab touch-none focus-visible:outline-4 focus-visible:outline-acento active:cursor-grabbing"
            onPointerDown={alBajar}
            onPointerMove={alMover}
            onPointerUp={alSoltar}
            onPointerCancel={alSoltar}
            onKeyDown={alTeclear}
          />
        )}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 border-b-2 border-dashed border-aviso/70 bg-aviso/10"
          style={{ height: `${zona.arribaPorCiento}%` }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 border-t-2 border-dashed border-aviso/70 bg-aviso/10"
          style={{ height: `${zona.abajoPorCiento}%` }}
        />
        {etiqueta && (
          <p
            className="pointer-events-none absolute inset-x-2 rounded-control bg-black/70 px-2 py-1 text-center text-[0.6rem] leading-tight font-semibold text-white"
            style={
              etiqueta === "arriba"
                ? { top: `${zona.arribaPorCiento + 2}%` }
                : { bottom: `${zona.abajoPorCiento + 2}%` }
            }
          >
            {TEXTO_ETIQUETA_SINTETICA}
          </p>
        )}
        {children}
      </div>
      {pie && <figcaption className="text-xs text-texto-suave">{pie}</figcaption>}
    </figure>
  );
}
