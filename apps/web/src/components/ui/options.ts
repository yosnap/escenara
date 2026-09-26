import type { ReactNode } from "react";

/** Opción común a todos los selectores del catálogo. */
export interface Opcion {
  value: string;
  label: string;
  descripcion?: string;
  icono?: ReactNode;
  deshabilitada?: boolean;
}

export const clasePopup =
  "z-50 max-h-(--available-height) min-w-(--anchor-width) origin-(--transform-origin) overflow-y-auto rounded-tarjeta border border-borde bg-superficie p-1.5 text-texto shadow-2xl shadow-black/15 outline-none transition-[scale,opacity] duration-(--motion-fast) data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0";

export const claseItem =
  "grid cursor-default grid-cols-[1.25rem_1fr] items-center gap-2 rounded-control px-2.5 py-2 text-base outline-none select-none data-disabled:opacity-40 data-highlighted:bg-elevada data-selected:font-semibold";
