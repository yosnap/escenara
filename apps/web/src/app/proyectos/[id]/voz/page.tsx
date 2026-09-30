import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ErrorProyecto } from "@/server/asistente/errores";
import { esAdmin, exigirSesion } from "@/server/auth/sesion";
import { estadoDeVoz } from "@/server/voz/consulta";
import { CabeceraApp } from "../../../_app/cabecera-app";
import { VistaVoz } from "./_componentes/vista-voz";

export const metadata: Metadata = { title: "Voz y subtítulos" };
export const dynamic = "force-dynamic";

/**
 * Voz y subtítulos de un proyecto (RF08, 0.21.0): el modo de voz, la voz fijada para todas las escenas, la pista de
 * cada una, el editor de subtítulos y la música autorizada.
 *
 * Lo hace **el dueño del proyecto**: un proyecto que no es tuyo responde como si no existiera, también para quien
 * administra (misma regla que la revisión de la 0.20.0).
 */
export default async function PaginaVoz({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await exigirSesion("/proyectos");
  const actor = { id: sesion.user.id, esAdmin: esAdmin(sesion) };
  const { id } = await params;
  const estado = await estadoDeVoz(actor, id).catch((error: unknown) => {
    if (error instanceof ErrorProyecto && error.estado === 404) notFound();
    throw error;
  });

  return (
    <div className="min-h-dvh bg-fondo">
      <CabeceraApp sesion={sesion} />
      <main id="contenido" className="mx-auto flex max-w-5xl flex-col gap-6 px-5 py-8 md:px-8">
        <VistaVoz inicial={estado} />
      </main>
    </div>
  );
}
