import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ErrorProyecto } from "@/server/asistente/errores";
import { esAdmin, exigirSesion } from "@/server/auth/sesion";
import { estadoDeProduccion } from "@/server/produccion/consulta";
import { CabeceraApp } from "../../../_app/cabecera-app";
import { VistaProduccion } from "./_componentes/vista-produccion";

export const metadata: Metadata = { title: "Producción · Escenara" };
export const dynamic = "force-dynamic";

/**
 * Rejilla de producción de un proyecto: escena a escena, con su fotograma, su clip, su coste estimado y el
 * consumido. Un proyecto que no es tuyo responde como si no existiera, también para quien administra
 * (`server/asistente/consulta.ts`).
 *
 * El estado se carga **en el servidor** y baja a la vista, que lo sondea mientras haya algo en vuelo.
 */
export default async function PaginaProduccion({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await exigirSesion("/proyectos");
  const actor = { id: sesion.user.id, esAdmin: esAdmin(sesion) };
  const { id } = await params;
  const produccion = await estadoDeProduccion(actor, id).catch((error: unknown) => {
    if (error instanceof ErrorProyecto && error.estado === 404) notFound();
    throw error;
  });

  return (
    <div className="min-h-dvh bg-fondo">
      <CabeceraApp sesion={sesion} />
      <main id="contenido" className="mx-auto flex max-w-5xl flex-col gap-6 px-5 py-8 md:px-8">
        <VistaProduccion inicial={produccion} />
      </main>
    </div>
  );
}
