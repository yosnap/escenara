import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

/**
 * Tarjeta de las pantallas de cuenta (entrar, registro, recuperar…); el logotipo va en la barra. Zona de claridad:
 * sin parallax ni texto sobre degradado, con contraste AA.
 */
export function TarjetaCuenta({
  titulo,
  descripcion,
  children,
  pie,
}: {
  titulo: string;
  descripcion?: ReactNode;
  children: ReactNode;
  pie?: ReactNode;
}) {
  return (
    <div className="flex w-full max-w-md flex-col gap-6 rounded-tarjeta border border-borde bg-superficie p-6 shadow-sm sm:p-8">
      <div>
        <h1 className="text-3xl font-bold text-texto">{titulo}</h1>
        {descripcion && <p className="mt-2 text-texto-suave">{descripcion}</p>}
      </div>
      {children}
      {pie && <div className="border-t border-borde/50 pt-5 text-center text-sm text-texto-suave">{pie}</div>}
    </div>
  );
}

export type Proveedor = "google" | "github";

const MARCAS: Record<Proveedor, { nombre: string; icono: ReactNode }> = {
  google: {
    nombre: "Google",
    icono: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5">
        <path
          fill="#4285F4"
          d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z"
        />
        <path
          fill="#34A853"
          d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z"
        />
        <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
        <path
          fill="#EA4335"
          d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z"
        />
      </svg>
    ),
  },
  github: {
    nombre: "GitHub",
    icono: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="currentColor">
        <path d="M12 .5a11.5 11.5 0 0 0-3.6 22.4c.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.9 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.2c0 .3.2.7.8.6A11.5 11.5 0 0 0 12 .5Z" />
      </svg>
    ),
  },
};

/** Botón para entrar con un proveedor externo, con su logotipo oficial. */
export function BotonProveedor({
  proveedor,
  className,
  ...props
}: { proveedor: Proveedor } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const marca = MARCAS[proveedor];
  return (
    <button
      type="button"
      className={cn(
        "inline-flex min-h-11 w-full items-center justify-center gap-3 rounded-control border border-borde bg-superficie px-4 font-semibold text-texto transition-colors duration-(--motion-fast) hover:bg-elevada disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {marca.icono}
      Continuar con {marca.nombre}
    </button>
  );
}

/** Separador «o» entre dos formas de acceso. Decorativo: los encabezados y botones ya lo explican. */
export function SeparadorO({ texto = "o" }: { texto?: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-texto-suave" aria-hidden>
      <span className="h-px flex-1 bg-borde/60" aria-hidden />
      <span aria-hidden>{texto}</span>
      <span className="h-px flex-1 bg-borde/60" aria-hidden />
    </div>
  );
}
