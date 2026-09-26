import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export type VarianteBoton = "primario" | "chispa" | "secundario" | "fantasma" | "peligro";
export type TamanoBoton = "sm" | "md" | "lg";

const VARIANTES: Record<VarianteBoton, string> = {
  primario: "bg-acento text-sobre-acento hover:brightness-110",
  chispa: "bg-degradado-chispa text-[#182032] shadow-lg shadow-v-coral/30 hover:-translate-y-0.5 hover:shadow-xl",
  secundario: "border border-borde bg-superficie text-texto hover:bg-elevada",
  fantasma: "text-texto hover:bg-elevada",
  peligro: "bg-error text-superficie hover:brightness-110",
};

const TAMANOS: Record<TamanoBoton, string> = {
  sm: "min-h-9 px-3 text-sm",
  md: "min-h-11 px-5 text-base",
  lg: "min-h-13 px-7 text-lg",
};

export interface BotonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBoton;
  tamano?: TamanoBoton;
  icono?: ReactNode;
  cargando?: boolean;
}

/** Botón de la marca. `chispa` es la llamada principal a crear; `peligro` para acciones destructivas. */
export function Boton({
  variante = "primario",
  tamano = "md",
  icono,
  cargando,
  className,
  children,
  disabled,
  type = "button",
  ...resto
}: BotonProps) {
  return (
    <button
      type={type}
      disabled={disabled || cargando}
      aria-busy={cargando || undefined}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-control font-semibold transition-all duration-(--motion-base) ease-out active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0",
        VARIANTES[variante],
        TAMANOS[tamano],
        className,
      )}
      {...resto}
    >
      {cargando ? (
        <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        icono
      )}
      {children}
    </button>
  );
}

export interface BotonIconoProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  etiqueta: string;
  children: ReactNode;
}

/** Botón solo con icono: exige una etiqueta accesible y mide al menos 44 × 44 px. */
export function BotonIcono({ etiqueta, className, children, type = "button", ...resto }: BotonIconoProps) {
  return (
    <button
      type={type}
      aria-label={etiqueta}
      title={etiqueta}
      className={cn(
        "inline-flex size-11 items-center justify-center rounded-full text-texto transition-colors duration-(--motion-fast) hover:bg-elevada disabled:opacity-50",
        className,
      )}
      {...resto}
    >
      {children}
    </button>
  );
}
