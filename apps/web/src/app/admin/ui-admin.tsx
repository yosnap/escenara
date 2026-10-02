import Link from "next/link";
import type { ReactNode } from "react";
import { Alerta } from "@/components/ui/alerta";
import { PAGINA_ADMIN, type Parametros } from "@/server/admin/filtros";

export { estiloCampoAdmin } from "./estilos-admin";
export function PaginaAdmin({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <main id="contenido" tabIndex={-1} className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 md:px-8">
      <h1 className="text-2xl font-bold">{titulo}</h1>
      {children}
    </main>
  );
}
export function ErrorAdmin({ children }: { children: ReactNode }) {
  return <Alerta tipo="error">{children}</Alerta>;
}
export function PaginacionAdmin({
  ruta,
  filtros,
  pagina,
  total,
}: {
  ruta: string;
  filtros: Parametros;
  pagina: number;
  total: number;
}) {
  const enlace = (numero: number) => {
    const p = new URLSearchParams();
    for (const [clave, valor] of Object.entries(filtros))
      if (typeof valor === "string" && clave !== "pagina") p.set(clave, valor);
    p.set("pagina", String(numero));
    return `${ruta}?${p}`;
  };
  return (
    <nav aria-label="Paginación" className="flex flex-wrap items-center gap-4">
      {pagina > 1 && (
        <Link href={enlace(pagina - 1)} className="min-h-11 py-2 text-acento">
          Anterior
        </Link>
      )}
      <span>
        Página {pagina} · {total} resultados
      </span>
      {pagina * PAGINA_ADMIN < total && (
        <Link href={enlace(pagina + 1)} className="min-h-11 py-2 text-acento">
          Siguiente
        </Link>
      )}
    </nav>
  );
}
