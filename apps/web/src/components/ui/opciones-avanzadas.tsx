"use client";

import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { type ReactNode, useId, useSyncExternalStore } from "react";
import { cn } from "./cn";

/**
 * **Opciones avanzadas** de un vídeo: el único sitio de las pantallas de usuario donde se ven nombres de modelo,
 * su selector, su precio por modelo y «Generado con…». Fuera solo se habla de duración y créditos.
 *
 * Empieza plegado. Se recuerda abierto o cerrado **por vídeo y solo en esta sesión del navegador**
 * (`sessionStorage`), nunca en la base de datos: es una comodidad de lectura, no una preferencia de la cuenta.
 * Cerrado no se monta el contenido, así que un nombre de modelo no está ni en el árbol de accesibilidad.
 */

/** Prefijo de la clave de sesión: una por vídeo (Crear, un proyecto, una escena…). */
export const PREFIJO_SESION_AVANZADAS = "escenara-avanzadas:";

const claveDeSesion = (clave: string) => `${PREFIJO_SESION_AVANZADAS}${clave}`;

/**
 * Lo recordado de cada vídeo vive en `sessionStorage`; si el navegador lo bloquea (modo privado estricto), en esta
 * memoria, que dura lo que la página. Los componentes se suscriben con `useSyncExternalStore`.
 */
const enMemoria = new Map<string, "1" | "0">();
const suscriptores = new Set<() => void>();

function leerRecordado(clave: string): "1" | "0" | null {
  try {
    const valor = globalThis.sessionStorage?.getItem(claveDeSesion(clave));
    if (valor === "1" || valor === "0") return valor;
  } catch {
    // Almacenamiento bloqueado: se mira la memoria de la página.
  }
  return enMemoria.get(clave) ?? null;
}

function recordar(clave: string, abierto: boolean): void {
  const valor = abierto ? "1" : "0";
  try {
    globalThis.sessionStorage?.setItem(claveDeSesion(clave), valor);
    enMemoria.delete(clave);
  } catch {
    // Sin almacenamiento solo se pierde el recuerdo entre páginas: el plegable sigue funcionando en esta.
    enMemoria.set(clave, valor);
  }
  for (const avisar of suscriptores) avisar();
}

function suscribir(avisar: () => void): () => void {
  suscriptores.add(avisar);
  return () => suscriptores.delete(avisar);
}

export function OpcionesAvanzadas({
  clave,
  titulo = "Opciones avanzadas",
  resumen,
  forzarAbierto = false,
  compacta = false,
  children,
  className,
}: {
  /** Identifica el vídeo (p. ej. `crear`, `proyecto:<id>`, `escena:<id>`): cada uno recuerda su estado. */
  clave: string;
  titulo?: string;
  /** Qué hay dentro, en una línea sin nombres de modelo («Modelo del clip y precio por modelo»). */
  resumen?: string;
  /**
   * Abre el bloque y no deja cerrarlo mientras sea `true`: lo usa quien tiene dentro un requisito pendiente
   * (un modelo sin elegir), para que «llevar al problema» encuentre el control.
   */
  forzarAbierto?: boolean;
  /** Versión pequeña para listas (historiales, versiones): botón de una línea y contenido en texto pequeño. */
  compacta?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const idContenido = useId();
  // En el servidor no hay sesión y todo empieza plegado; en el cliente manda lo que recuerde **este** vídeo, así que
  // si el mismo bloque pasa a ser de otro vídeo toma el estado del nuevo (plegado si no recuerda nada).
  const abierto = useSyncExternalStore(
    suscribir,
    () => leerRecordado(clave) === "1",
    () => false,
  );

  const visible = abierto || forzarAbierto;
  const cambiar = () => {
    if (forzarAbierto) return;
    recordar(clave, !abierto);
  };

  return (
    <section data-opciones-avanzadas={clave} className={cn("flex flex-col", compacta ? "gap-2" : "gap-4", className)}>
      <button
        type="button"
        aria-expanded={visible}
        aria-controls={visible ? idContenido : undefined}
        aria-disabled={forzarAbierto || undefined}
        onClick={cambiar}
        className={cn(
          "flex min-h-9 items-center rounded-control border-borde bg-superficie text-left font-semibold text-texto transition-colors duration-(--motion-fast) hover:border-acento focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento aria-disabled:cursor-default",
          compacta ? "w-fit gap-2 border px-3 py-1 text-sm" : "min-h-11 w-full gap-3 border-2 px-4 py-2 text-base",
        )}
      >
        <SlidersHorizontal aria-hidden className={cn("shrink-0 text-texto-suave", compacta ? "size-4" : "size-5")} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span>{titulo}</span>
          {resumen && !compacta && <span className="text-sm font-normal text-texto-suave">{resumen}</span>}
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            "shrink-0 transition-transform duration-(--motion-fast)",
            compacta ? "size-4" : "size-5",
            visible && "rotate-180",
          )}
        />
      </button>
      {forzarAbierto && (
        <p className="text-sm text-texto-suave">Se queda abierto mientras falte algo por elegir aquí dentro.</p>
      )}
      {visible && (
        <div
          id={idContenido}
          className={cn(
            "flex flex-col rounded-tarjeta border-borde bg-superficie",
            compacta ? "gap-1 border p-3 text-sm" : "gap-4 border-2 p-4",
          )}
        >
          {children}
        </div>
      )}
    </section>
  );
}

/**
 * «Generado con…» de un trabajo o una versión, dentro de sus Opciones avanzadas compactas: es el único sitio de las
 * pantallas de usuario donde se dice con qué modelo salió.
 */
export function GeneradoCon({ clave, modelo }: { clave: string; modelo: string }) {
  if (modelo.trim() === "") return null;
  return (
    <OpcionesAvanzadas clave={clave} compacta>
      <p className="text-texto-suave">
        Generado con <span className="font-mono text-texto">{modelo}</span>
      </p>
    </OpcionesAvanzadas>
  );
}
