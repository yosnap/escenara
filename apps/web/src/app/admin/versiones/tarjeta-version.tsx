import { AlertTriangle, Minus, RefreshCw, ShieldCheck, Sparkles, Trash2, Wrench } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { fragmentosEnLinea, type VersionPublicada } from "@/lib/changelog";

const ESTILO_SECCION: Record<string, { icono: ReactNode; color: string }> = {
  Añadido: { icono: <Sparkles />, color: "text-correcto bg-correcto/12" },
  Cambiado: { icono: <RefreshCw />, color: "text-acento bg-acento/12" },
  Corregido: { icono: <Wrench />, color: "text-aviso bg-aviso/12" },
  Seguridad: { icono: <ShieldCheck />, color: "text-error bg-error/12" },
  Eliminado: { icono: <Trash2 />, color: "text-error bg-error/12" },
  Obsoleto: { icono: <AlertTriangle />, color: "text-aviso bg-aviso/12" },
};
const ESTILO_OTRO = { icono: <Minus />, color: "text-texto-suave bg-elevada" };

function Entrada({ texto }: { texto: string }) {
  return (
    <>
      {fragmentosEnLinea(texto).map((f, i) => {
        const clave = `${i}-${f.tipo}`;
        if (f.tipo === "codigo") {
          return (
            <code key={clave} className="rounded bg-elevada px-1.5 font-mono text-[0.9em]">
              {f.valor}
            </code>
          );
        }
        if (f.tipo === "negrita") return <strong key={clave}>{f.valor}</strong>;
        return <span key={clave}>{f.valor}</span>;
      })}
    </>
  );
}

function formatearFecha(fecha: string) {
  return new Date(`${fecha}T12:00:00`).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
}

export function TarjetaVersion({ version, actual }: { version: VersionPublicada; actual: boolean }) {
  return (
    <article
      aria-labelledby={`version-${version.version}`}
      className={cn(
        "flex flex-col gap-5 rounded-tarjeta border bg-superficie p-6",
        actual ? "border-acento/50 shadow-lg shadow-acento/10" : "border-borde/60",
      )}
    >
      <header className="flex flex-wrap items-center gap-3">
        <h2
          id={`version-${version.version}`}
          className={cn(
            "rounded-full px-4 py-1 font-mono text-lg font-bold",
            // Texto oscuro sobre «Chispa»: el degradado Escenario pasa por el sol, donde el blanco no se lee.
            actual ? "bg-degradado-chispa text-[#182032]" : "bg-elevada text-texto",
          )}
        >
          {version.fecha ? `v${version.version}` : version.version}
        </h2>
        {actual && (
          <span className="rounded-full bg-correcto/12 px-3 py-1 text-sm font-semibold text-correcto">Actual</span>
        )}
        <span className="text-texto-suave">{version.fecha ? formatearFecha(version.fecha) : "Sin publicar"}</span>
      </header>
      {version.secciones.map((s) => {
        const estilo = ESTILO_SECCION[s.titulo] ?? ESTILO_OTRO;
        return (
          <section key={s.titulo} className="flex flex-col gap-2">
            <h3 className="flex items-center gap-2 font-bold text-texto">
              <span
                aria-hidden
                className={cn("flex size-7 items-center justify-center rounded-full [&>svg]:size-4", estilo.color)}
              >
                {estilo.icono}
              </span>
              {s.titulo}
            </h3>
            <ul className="ml-9 flex list-disc flex-col gap-1.5 text-texto marker:text-texto-suave">
              {s.entradas.map((e) => (
                <li key={e}>
                  <Entrada texto={e} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </article>
  );
}
