import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { claseBoton } from "@/components/ui/button";
import { MiniaturaMedio } from "@/components/ui/media/miniatura-medio";
import { ErrorProyecto } from "@/server/asistente/errores";
import { exigirSesion } from "@/server/auth/sesion";
import { prepararAB, ultimaComparativaDeEscena } from "@/server/comparativas/ab";
import { CabeceraApp } from "../../../_app/cabecera-app";
import { ComparativaAB } from "./comparativa-ab";

export const metadata: Metadata = { title: "Comparar generando" };
export const dynamic = "force-dynamic";

/**
 * **Comparar generando** en una escena del usuario: dos modelos animan el mismo fotograma aprobado. Una escena ajena o
 * que no existe responde 404, sin decir cuál de las dos cosas es.
 */
export default async function PaginaComparativaEscena({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sesion = await exigirSesion(`/comparar/escena/${id}`);
  const actor = { id: sesion.user.id, esAdmin: false };
  const datos = await Promise.all([prepararAB(actor, id), ultimaComparativaDeEscena(actor, id)]).catch((error) => {
    if (error instanceof ErrorProyecto && error.estado === 404) notFound();
    throw error;
  });
  const [preparacion, ultima] = datos;

  return (
    <div className="min-h-dvh bg-fondo">
      <CabeceraApp sesion={sesion} />
      <main id="contenido" tabIndex={-1} className="mx-auto flex max-w-5xl flex-col gap-6 px-5 py-8 md:px-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-4xl font-bold text-texto">Comparar generando · escena {preparacion.orden}</h1>
            <p className="mt-2 max-w-3xl text-texto-suave">
              Dos modelos animan el mismo fotograma aprobado de esta escena. <strong>Esto sí gasta</strong>: son dos
              clips normales, con su reserva de presupuesto y sus controles de siempre. Los resultados no cambian la
              escena hasta que eliges uno.
            </p>
          </div>
          <Link href={`/proyectos/${preparacion.proyectoId}/produccion`} className={claseBoton("fantasma", "sm")}>
            <ArrowLeft className="size-4" aria-hidden /> Volver a la producción
          </Link>
        </div>
        {preparacion.fotograma && (
          <figure className="flex items-center gap-3">
            <div className="size-24 overflow-hidden rounded-control bg-elevada">
              <MiniaturaMedio
                medio={preparacion.fotograma}
                className="size-full object-contain"
                alt="Fotograma aprobado de la escena"
              />
            </div>
            <figcaption className="text-sm text-texto-suave">El fotograma que animarán los dos modelos.</figcaption>
          </figure>
        )}
        <p className="text-sm text-texto-suave">
          ¿Solo quieres ver precios y ejemplos?{" "}
          <Link href="/comparar" className="font-semibold text-acento underline">
            Compara sin generar
          </Link>
          : no gasta nada.
        </p>
        <ComparativaAB preparacion={preparacion} inicial={ultima} />
      </main>
    </div>
  );
}
