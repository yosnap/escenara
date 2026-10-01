import { BookOpen } from "lucide-react";
import { cn } from "./cn";

/** La guía se abre aparte para conservar la creación que el usuario tenga en curso. */
export function EnlaceDocumentacion({ className }: { className?: string }) {
  return (
    <a
      href="https://docs.escenara.com"
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold text-texto-suave transition-colors duration-(--motion-fast) hover:bg-elevada hover:text-texto",
        className,
      )}
    >
      <BookOpen className="size-4" aria-hidden />
      Documentación
      <span className="sr-only"> (se abre en otra pestaña)</span>
    </a>
  );
}
