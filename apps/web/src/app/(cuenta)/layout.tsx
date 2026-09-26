import Link from "next/link";
import type { ReactNode } from "react";
import { Logotipo } from "@/components/ui/logotipo";
import { SelectorTema } from "@/components/ui/theme-toggle";

/** Pantallas de acceso: zona de claridad, sin parallax ni degradados detrás del texto. */
export default function LayoutCuenta({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-fondo">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-4 md:px-8">
        <Link href="/" className="text-texto" aria-label="Escenara, volver a la portada">
          <Logotipo />
        </Link>
        <SelectorTema />
      </header>
      <main id="contenido" className="flex flex-1 items-start justify-center px-5 py-8 sm:items-center">
        {children}
      </main>
    </div>
  );
}
