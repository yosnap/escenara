import { Wand2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { claseBoton } from "@/components/ui/button";
import { exigirSesion } from "@/server/auth/sesion";
import { listarTrabajos } from "@/server/generacion/trabajos";
import { CabeceraApp } from "../../_app/cabecera-app";
import { ListaTrabajos } from "./_componentes/lista-trabajos";

export const metadata: Metadata = { title: "Historial de generaciones · Escenara" };
export const dynamic = "force-dynamic";

/** Historial de lo generado por quien consulta. Nadie ve los trabajos de otra persona. */
export default async function PaginaHistorial() {
  const sesion = await exigirSesion("/crear/historial");
  const trabajos = await listarTrabajos(sesion.user.id);
  return (
    <div className="min-h-dvh bg-fondo">
      <CabeceraApp sesion={sesion} />
      <main id="contenido" className="mx-auto flex max-w-4xl flex-col gap-6 px-5 py-8 md:px-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-4xl font-bold text-texto">Historial de generaciones</h1>
            <p className="mt-2 max-w-2xl text-texto-suave">
              Todo lo que has pedido, con su estado real en el proveedor, los créditos y el archivo resultante.
            </p>
          </div>
          <Link href="/crear" className={claseBoton("chispa", "sm")}>
            <Wand2 className="size-4" aria-hidden /> Crear
          </Link>
        </div>
        <ListaTrabajos iniciales={trabajos} />
      </main>
    </div>
  );
}
