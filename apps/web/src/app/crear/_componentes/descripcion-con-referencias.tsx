"use client";

import { type TextareaHTMLAttributes, useId, useRef, useState } from "react";
import { claseControl } from "@/components/ui/field";
import { USOS_REFERENCIA } from "@/lib/referencias-temporales";
import type { ReferenciaEnPantalla } from "./referencias-en-pantalla";

/** La mención se detecta en el cursor, sin confundir correos ni modificar el resto de la escena. */
export function mencionEnCursor(texto: string, cursor: number) {
  const coincidencia = /(?:^|[^\w.])@([a-zA-Z0-9_-]*)$/.exec(texto.slice(0, cursor));
  const busqueda = coincidencia?.[1];
  return busqueda !== undefined ? { inicio: cursor - busqueda.length - 1, busqueda } : null;
}

export function DescripcionConReferencias({
  valor,
  onCambio,
  referencias,
  ...props
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> & {
  valor: string;
  onCambio: (texto: string) => void;
  referencias: readonly ReferenciaEnPantalla[];
}) {
  const campo = useRef<HTMLTextAreaElement>(null);
  const resaltado = useRef<HTMLDivElement>(null);
  const listaId = useId();
  const [cursor, setCursor] = useState<number | null>(null);
  const [activo, setActivo] = useState(0);
  const [oculta, setOculta] = useState(false);
  const mencion = cursor === null || oculta ? null : mencionEnCursor(valor, cursor);
  const opciones = referencias.filter(
    (r, i) =>
      r.medio &&
      /^[a-z][a-z0-9_-]{0,29}$/.test(r.etiqueta) &&
      referencias.findIndex((otra) => otra.etiqueta === r.etiqueta) === i &&
      r.etiqueta.startsWith(mencion?.busqueda.toLowerCase() ?? ""),
  );
  const indice = Math.min(activo, Math.max(0, opciones.length - 1));
  const etiquetas = new Set(referencias.filter((r) => r.medio).map((r) => r.etiqueta));
  const partes = valor.split(/((?<![\w.])@[a-zA-Z][a-zA-Z0-9_-]*)/g);
  const conResaltado = etiquetas.size > 0;
  const elegir = (referencia: ReferenciaEnPantalla) => {
    if (!mencion || cursor === null) return;
    const resto = valor.slice(cursor).replace(/^[a-zA-Z0-9_-]*/, "");
    const insercion = `@${referencia.etiqueta}${/^[\s.,;:!?)}\]]/.test(resto) ? "" : " "}`;
    const posicion = mencion.inicio + insercion.length;
    onCambio(`${valor.slice(0, mencion.inicio)}${insercion}${resto}`);
    setCursor(null);
    setOculta(true);
    requestAnimationFrame(() => {
      campo.current?.focus();
      campo.current?.setSelectionRange(posicion, posicion);
    });
  };
  return (
    <div className="relative">
      <div className="relative">
        {conResaltado && (
          <div
            ref={resaltado}
            aria-hidden="true"
            className={`${claseControl} pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words font-mono`}
          >
            {partes.map((parte, i) =>
              etiquetas.has(parte.slice(1)) && parte.startsWith("@") ? (
                // biome-ignore lint/suspicious/noArrayIndexKey: fragmentos de texto sin estado, con menciones repetidas.
                <strong key={`${i}-${parte}`} className="rounded-sm bg-acento/10 font-bold text-acento">
                  {parte}
                </strong>
              ) : (
                parte
              ),
            )}
            {"\n"}
          </div>
        )}
        <textarea
          {...props}
          ref={campo}
          className={`${claseControl} relative min-h-28 resize-y ${conResaltado ? "bg-transparent font-mono text-transparent caret-texto selection:bg-acento/20 selection:text-texto" : ""}`}
          value={valor}
          aria-autocomplete="list"
          aria-controls={mencion ? listaId : undefined}
          aria-activedescendant={mencion && opciones.length ? `${listaId}-${indice}` : undefined}
          onChange={(e) => {
            onCambio(e.target.value);
            setCursor(e.target.selectionStart);
            setActivo(0);
            setOculta(false);
          }}
          onSelect={(e) => setCursor(e.currentTarget.selectionStart)}
          onBlur={() => setCursor(null)}
          onFocus={(e) => {
            setCursor(e.currentTarget.selectionStart);
            setOculta(false);
          }}
          onClick={() => setOculta(false)}
          onScroll={(e) => {
            if (resaltado.current) {
              resaltado.current.scrollTop = e.currentTarget.scrollTop;
              resaltado.current.scrollLeft = e.currentTarget.scrollLeft;
            }
          }}
          onKeyDown={(e) => {
            if (!mencion) return;
            if (e.key === "Escape") {
              e.preventDefault();
              setCursor(null);
              setOculta(true);
            } else if (opciones.length && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
              e.preventDefault();
              setActivo((indice + (e.key === "ArrowDown" ? 1 : -1) + opciones.length) % opciones.length);
            } else if (opciones.length && (e.key === "Enter" || e.key === "Tab")) {
              e.preventDefault();
              const opcion = opciones[indice];
              if (opcion) elegir(opcion);
            }
          }}
        />
      </div>
      {mencion && (
        <div className="absolute inset-x-0 top-full z-40 mt-1 rounded-tarjeta border border-borde bg-superficie p-1.5 shadow-2xl">
          {opciones.length ? (
            <div id={listaId} role="listbox" aria-label="Referencias de esta escena">
              {opciones.map((r, i) => (
                <button
                  key={r.id}
                  type="button"
                  tabIndex={-1}
                  id={`${listaId}-${i}`}
                  role="option"
                  aria-selected={i === indice}
                  className={`w-full cursor-pointer rounded-control px-3 py-2 text-left text-texto ${i === indice ? "bg-elevada" : ""}`}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => elegir(r)}
                >
                  <span className="font-semibold">@{r.etiqueta}</span>
                  <span className="ml-2 text-sm text-texto-suave">{USOS_REFERENCIA[r.uso]}</span>
                </button>
              ))}
            </div>
          ) : (
            <p role="status" className="px-3 py-2 text-sm text-texto-suave">
              {referencias.some((r) => r.medio)
                ? "No hay referencias con esa etiqueta."
                : "Añade una imagen y su etiqueta en Referencias para esta escena."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
