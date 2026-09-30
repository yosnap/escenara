"use client";

import {
  type Announcements,
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  type ScreenReaderInstructions,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

import { type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { mismoOrden, moverEnLista } from "@/lib/lista-ordenable";
import { cn } from "./cn";
import { useMovimientoReducido } from "./use-movimiento-reducido";

/**
 * Lista que se ordena arrastrando, con **el teclado cubierto igual de bien**: el orden de una lista no puede
 * depender de tener ratón o pantalla táctil.
 *
 * Lo mueve `@dnd-kit`, que es lo que hace bien lo difícil de arrastrar y soltar: el elemento cogido sigue al
 * puntero de verdad, los huecos se deciden por el centro de cada tarjeta (y no por lo que haya justo debajo del
 * dedo, que es lo que provoca los saltos de ida y vuelta), y el mismo gesto vale para ratón, lápiz y dedo.
 *
 * - **Ratón y dedo**: se arrastra por el asa. Hace falta moverse unos píxeles para empezar, así que pulsar el asa
 *   sin querer no descoloca nada.
 * - **Teclado**: se enfoca el asa, `Espacio` o `Intro` **coge** el elemento, las flechas lo mueven, `Espacio`
 *   o `Intro` lo sueltan y `Escape` lo deja como estaba. Cada paso se dice en una zona `aria-live`, con los
 *   textos de aquí abajo (los de la librería están en inglés).
 *
 * `onOrden` se llama **una sola vez al terminar**, nunca en cada movimiento, y con el orden completo. Mientras el
 * servidor contesta se ve el orden nuevo (estado optimista); si falla, se vuelve al que hay guardado.
 */

export interface ElementoOrdenable {
  clave: string;
  /** `id` del elemento en la página, para poder enlazarlo desde fuera de la lista. */
  id?: string;
  /** Cómo se nombra el elemento al anunciar el movimiento. Es lo que oye quien usa un lector de pantalla. */
  etiqueta: string;
  contenido: ReactNode;
}

/** Cómo se coge y se suelta. Se muestra a la vista: también ayuda a quien sí usa el ratón. */
export const AYUDA_ORDENAR =
  "Arrastra por el asa para cambiar el orden. Con el teclado: enfoca el asa, pulsa Espacio para coger, muévelo con las flechas, Espacio para soltarlo y Escape para dejarlo como estaba.";

const INSTRUCCIONES: ScreenReaderInstructions = { draggable: AYUDA_ORDENAR };

export function ListaOrdenable({
  elementos,
  etiquetaLista,
  onOrden,
  deshabilitado = false,
  className,
  claseElemento,
}: {
  elementos: readonly ElementoOrdenable[];
  /** Nombre de la lista para quien no la ve. */
  etiquetaLista: string;
  /** Orden completo al terminar de mover. Devuelve el error, o `null` si se ha guardado. */
  onOrden: (claves: string[]) => Promise<string | null>;
  deshabilitado?: boolean;
  className?: string;
  claseElemento?: string;
}) {
  const contexto = useId();
  /** Orden ya soltado y pendiente de que lo confirme el servidor. */
  const [optimista, setOptimista] = useState<string[] | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);

  const delServidor = elementos.map((e) => e.clave);
  const orden = optimista ?? delServidor;
  const porClave = new Map(elementos.map((e) => [e.clave, e]));
  const visibles = orden.flatMap((clave) => porClave.get(clave) ?? []);

  /**
   * El control que tenía el foco dentro de la lista. Subir o bajar cambia el orden, y un elemento que se mueve en
   * el DOM (o que se queda sin «Subir» por ser ya el primero) pierde el foco: se devuelve al mismo control, o al
   * asa si ese ya no se puede usar, y se anuncia la posición nueva, que con los botones no la dice nadie.
   */
  const raiz = useRef<HTMLOListElement>(null);
  const foco = useRef<{ clave: string; etiqueta: string | null; enAsa: boolean } | null>(null);
  const [anuncio, setAnuncio] = useState("");
  const firmaDeOrden = orden.join("\u0000");
  const firmaAnterior = useRef(firmaDeOrden);

  useEffect(() => {
    const lista = raiz.current;
    if (!lista) return;
    const alEnfocar = (evento: FocusEvent) => {
      const control = evento.target instanceof HTMLElement ? evento.target : null;
      const li = control?.closest<HTMLElement>("li[data-clave]");
      if (!control || !li || li.parentElement !== lista) return;
      foco.current = {
        clave: li.dataset.clave ?? "",
        etiqueta: control.getAttribute("aria-label"),
        enAsa: control.hasAttribute("data-asa"),
      };
    };
    lista.addEventListener("focusin", alEnfocar);
    return () => lista.removeEventListener("focusin", alEnfocar);
  }, []);

  useLayoutEffect(() => {
    if (firmaAnterior.current === firmaDeOrden) return;
    firmaAnterior.current = firmaDeOrden;
    const ultimo = foco.current;
    const lista = raiz.current;
    if (!ultimo || !lista) return;
    const li = Array.from(lista.children).find(
      (hijo): hijo is HTMLElement => hijo instanceof HTMLElement && hijo.dataset.clave === ultimo.clave,
    );
    if (!li) return;
    const activo = document.activeElement;
    const perdido = !activo || activo === document.body || (activo instanceof HTMLButtonElement && activo.disabled);
    if (perdido) {
      const usables = Array.from(li.querySelectorAll<HTMLButtonElement>("button:not([disabled])"));
      const mismo =
        ultimo.etiqueta === null ? undefined : usables.find((b) => b.getAttribute("aria-label") === ultimo.etiqueta);
      (mismo ?? usables.find((b) => b.hasAttribute("data-asa")) ?? usables[0])?.focus();
    }
    // Arrastrar ya se anuncia solo (dnd-kit); con los botones de subir y bajar, no.
    if (!ultimo.enAsa) {
      const etiqueta = porClave.get(ultimo.clave)?.etiqueta ?? "El elemento";
      setAnuncio(`${etiqueta} queda en la posición ${orden.indexOf(ultimo.clave) + 1} de ${orden.length}.`);
    }
  });

  const sensores = useSensors(
    // Unos píxeles de margen: así un clic en el asa no cuenta como arrastre, y en el móvil se puede hacer
    // scroll desde encima del asa sin llevarse la foto por delante.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const nombre = (id: string | number | undefined) => porClave.get(String(id))?.etiqueta ?? "El elemento";
  const posicion = (id: string | number | undefined) => orden.indexOf(String(id)) + 1;

  /** Lo que se dice al mover, en castellano: los textos de la librería vienen en inglés. */
  const anuncios: Announcements = {
    onDragStart: ({ active }) =>
      `Has cogido ${nombre(active.id)}, en la posición ${posicion(active.id)} de ${orden.length}.`,
    onDragOver: ({ active, over }) =>
      over ? `${nombre(active.id)} pasaría a la posición ${posicion(over.id)} de ${orden.length}.` : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? `${nombre(active.id)} queda en la posición ${posicion(over.id)} de ${orden.length}.`
        : `${nombre(active.id)} se queda donde estaba.`,
    onDragCancel: ({ active }) => `Se ha dejado el orden como estaba. ${nombre(active.id)} no se ha movido.`,
  };

  const alTerminar = async ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const desde = orden.indexOf(String(active.id));
    const hasta = orden.indexOf(String(over.id));
    if (desde < 0 || hasta < 0) return;
    const nuevo = moverEnLista(orden, desde, hasta);
    if (mismoOrden(nuevo, delServidor)) return;
    setOptimista(nuevo);
    setFallo(null);
    const error = await onOrden(nuevo);
    // En los dos casos se deja de mandar el orden de este navegador: si ha ido bien ya llega el del servidor, y
    // si ha fallado se vuelve a ver el que está guardado de verdad.
    setOptimista(null);
    setFallo(error ? `No se ha podido guardar el orden nuevo, así que se ha vuelto al anterior. ${error}` : null);
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-texto-suave">{AYUDA_ORDENAR}</p>
      <DndContext
        id={contexto}
        sensors={sensores}
        collisionDetection={closestCenter}
        accessibility={{ announcements: anuncios, screenReaderInstructions: INSTRUCCIONES }}
        onDragEnd={(evento) => void alTerminar(evento)}
      >
        <SortableContext items={orden} strategy={rectSortingStrategy}>
          <ol ref={raiz} aria-label={etiquetaLista} className={className}>
            {visibles.map((elemento, indice) => (
              <ElementoDeLista
                key={elemento.clave}
                elemento={elemento}
                indice={indice}
                total={visibles.length}
                deshabilitado={deshabilitado}
                className={claseElemento}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      {/* Que el orden no se haya guardado se dice, no solo se deshace por sorpresa. */}
      <p aria-live="polite" className="sr-only">
        {fallo}
        {anuncio}
      </p>
    </div>
  );
}

function ElementoDeLista({
  elemento,
  indice,
  total,
  deshabilitado,
  className,
}: {
  elemento: ElementoOrdenable;
  indice: number;
  total: number;
  deshabilitado: boolean;
  className?: string;
}) {
  const reducido = useMovimientoReducido();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: elemento.clave,
    disabled: deshabilitado || total < 2,
  });

  return (
    <li
      ref={setNodeRef}
      id={elemento.id}
      data-clave={elemento.clave}
      style={{ transform: CSS.Transform.toString(transform), transition: reducido ? undefined : transition }}
      className={cn(
        "relative scroll-mt-24",
        className,
        isDragging && "z-10 shadow-xl outline-2 outline-acento outline-offset-2",
      )}
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          ref={setActivatorNodeRef}
          aria-label={`Cambiar el orden de ${elemento.etiqueta}`}
          data-asa=""
          disabled={deshabilitado || total < 2}
          {...attributes}
          {...listeners}
          className="inline-flex size-9 shrink-0 touch-none cursor-grab items-center justify-center rounded-control text-texto-suave hover:bg-elevada hover:text-texto focus-visible:outline-2 focus-visible:outline-acento focus-visible:outline-offset-2 active:cursor-grabbing disabled:cursor-default disabled:opacity-40"
        >
          <GripVertical className="size-4" aria-hidden />
        </button>
        <span aria-hidden className="font-mono text-xs font-semibold text-texto-suave">
          {indice + 1}
        </span>
      </div>
      {elemento.contenido}
    </li>
  );
}
