"use client";

import { Dialog as D } from "@base-ui/react/dialog";
import { Tabs as T } from "@base-ui/react/tabs";
import { Tooltip as TT } from "@base-ui/react/tooltip";
import { X } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

/** Diálogo modal accesible con foco atrapado y cierre por Escape. */
export function Dialogo({
  disparador,
  titulo,
  descripcion,
  children,
  pie,
}: {
  disparador: ReactElement;
  titulo: string;
  descripcion?: string;
  children?: ReactNode;
  pie?: ReactNode;
}) {
  return (
    <D.Root>
      <D.Trigger render={disparador} />
      <D.Portal>
        <D.Backdrop className="fixed inset-0 z-40 bg-black/45 backdrop-blur-sm transition-opacity duration-(--motion-base) data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <D.Popup className="fixed top-1/2 left-1/2 z-50 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-tarjeta border border-borde bg-superficie p-6 text-texto shadow-2xl transition-all duration-(--motion-base) data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <D.Title className="text-2xl font-bold">{titulo}</D.Title>
              {descripcion && <D.Description className="mt-1 text-texto-suave">{descripcion}</D.Description>}
            </div>
            <D.Close
              aria-label="Cerrar"
              className="flex size-10 items-center justify-center rounded-full hover:bg-elevada"
            >
              <X className="size-5" />
            </D.Close>
          </div>
          {children}
          {pie && <div className="mt-6 flex justify-end gap-3">{pie}</div>}
        </D.Popup>
      </D.Portal>
    </D.Root>
  );
}

/** Ayuda breve al pasar el ratón o enfocar. No sustituye a una etiqueta visible. */
export function Ayuda({ texto, children }: { texto: string; children: ReactElement }) {
  return (
    <TT.Provider>
      <TT.Root>
        <TT.Trigger render={children} />
        <TT.Portal>
          <TT.Positioner sideOffset={8}>
            <TT.Popup className="max-w-xs rounded-control bg-texto px-3 py-1.5 text-sm text-fondo shadow-lg transition-opacity duration-(--motion-fast) data-ending-style:opacity-0 data-starting-style:opacity-0">
              {texto}
            </TT.Popup>
          </TT.Positioner>
        </TT.Portal>
      </TT.Root>
    </TT.Provider>
  );
}

export interface Pestana {
  valor: string;
  etiqueta: ReactNode;
  contenido: ReactNode;
}

/** Pestañas con indicador animado. */
export function Pestanas({ pestanas, inicial }: { pestanas: Pestana[]; inicial?: string }) {
  return (
    <T.Root defaultValue={inicial ?? pestanas[0]?.valor}>
      <T.List className="relative flex gap-1 rounded-full bg-elevada p-1">
        {pestanas.map((p) => (
          <T.Tab
            key={p.valor}
            value={p.valor}
            className="relative z-10 min-h-10 flex-1 rounded-full px-4 text-sm font-semibold text-texto-suave transition-colors duration-(--motion-fast) data-active:text-sobre-acento"
          >
            {p.etiqueta}
          </T.Tab>
        ))}
        <T.Indicator className="absolute top-1 left-(--active-tab-left) h-(--active-tab-height) w-(--active-tab-width) rounded-full bg-acento transition-all duration-(--motion-base)" />
      </T.List>
      {pestanas.map((p) => (
        <T.Panel key={p.valor} value={p.valor} className="pt-4">
          {p.contenido}
        </T.Panel>
      ))}
    </T.Root>
  );
}
