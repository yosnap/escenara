import { Star } from "lucide-react";
import { URL_REPOSITORIO } from "@/lib/repositorio";
import { EstrellasRepositorio } from "./estrellas-repositorio";

/** Enlace compacto al código, con el recuento real cuando está disponible. */
export function EnlaceGitHub({ estrellas }: { estrellas?: number | null }) {
  return (
    <a
      href={URL_REPOSITORIO}
      target="_blank"
      rel="noopener noreferrer"
      title="Apoya Escenara con una estrella en GitHub"
      className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-semibold text-texto-suave transition-colors duration-(--motion-fast) hover:bg-elevada hover:text-texto"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="currentColor">
        <path d="M12 .75a11.25 11.25 0 0 0-3.558 21.923c.563.104.768-.244.768-.542 0-.267-.01-.974-.015-1.912-3.13.68-3.79-1.508-3.79-1.508-.512-1.3-1.25-1.646-1.25-1.646-1.022-.698.077-.684.077-.684 1.13.08 1.724 1.16 1.724 1.16 1.004 1.72 2.634 1.223 3.276.935.102-.727.393-1.223.715-1.504-2.498-.284-5.124-1.249-5.124-5.563 0-1.229.439-2.234 1.16-3.021-.116-.285-.502-1.43.11-2.98 0 0 .945-.303 3.094 1.154A10.78 10.78 0 0 1 12 6.183c.955.004 1.917.129 2.813.379 2.148-1.457 3.091-1.154 3.091-1.154.614 1.55.228 2.695.112 2.98.723.787 1.159 1.792 1.159 3.021 0 4.325-2.63 5.276-5.135 5.555.404.349.764 1.034.764 2.084 0 1.504-.014 2.717-.014 3.085 0 .3.203.65.774.54A11.252 11.252 0 0 0 12 .75Z" />
      </svg>
      <Star className="size-3.5" aria-hidden />
      <span className="sr-only">Escenara en GitHub </span>
      <EstrellasRepositorio estrellas={estrellas} />
      <span className="sr-only"> (se abre en otra pestaña)</span>
    </a>
  );
}
