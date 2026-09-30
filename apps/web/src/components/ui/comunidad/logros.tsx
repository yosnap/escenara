import { Award, Lock } from "lucide-react";
import { fechaCorta, type LogroVista } from "@/lib/comunidad";
import { cn } from "../cn";

/** Logros por hitos reales: los conseguidos con su fecha y los que faltan con lo que hay que hacer. Sin rachas. */
export function ListaLogros({ logros }: { logros: LogroVista[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {logros.map((l) => (
        <li
          key={l.clave}
          className={cn(
            "flex items-start gap-3 rounded-tarjeta border p-4",
            l.conseguidoEl ? "border-chispa/60 bg-chispa/10" : "border-borde bg-superficie",
          )}
        >
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-full",
              l.conseguidoEl ? "bg-chispa/25 text-texto" : "bg-elevada text-texto-suave",
            )}
          >
            {l.conseguidoEl ? <Award className="size-5" aria-hidden /> : <Lock className="size-5" aria-hidden />}
          </span>
          <span className="flex flex-col">
            <span className="font-semibold text-texto">{l.titulo}</span>
            <span className="text-sm text-texto-suave">
              {l.conseguidoEl
                ? `${l.descripcion} Conseguido el ${fechaCorta(l.conseguidoEl)}.`
                : `Todavía no. ${l.pista}`}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
