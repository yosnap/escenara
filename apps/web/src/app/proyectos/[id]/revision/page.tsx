import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ErrorProyecto } from "@/server/asistente/errores";
import { esAdmin, exigirSesion } from "@/server/auth/sesion";
import { estadoDeRevision } from "@/server/revision/consulta";
import { CabeceraApp } from "../../../_app/cabecera-app";
import { VistaRevision } from "./_componentes/vista-revision";

export const metadata: Metadata = { title: "Revisión" };
export const dynamic = "force-dynamic";

/**
 * Revisión de continuidad de un proyecto (RF07, 0.20.0): escena a escena, el clip junto a la hoja de personaje y al
 * fotograma aprobado, con las comprobaciones técnicas y la decisión de la persona que revisa.
 *
 * Revisa **el dueño del proyecto**: un proyecto que no es tuyo responde como si no existiera, también para quien
 * administra (decisión provisional del propietario, 2026-09-27; la moderación llega en 0.28.0).
 */
export default async function PaginaRevision({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await exigirSesion("/proyectos");
  const actor = { id: sesion.user.id, esAdmin: esAdmin(sesion) };
  const { id } = await params;
  const revision = await estadoDeRevision(actor, id).catch((error: unknown) => {
    if (error instanceof ErrorProyecto && error.estado === 404) notFound();
    throw error;
  });

  return (
    <div className="min-h-dvh bg-fondo">
      <CabeceraApp sesion={sesion} />
      <main id="contenido" tabIndex={-1} className="mx-auto flex max-w-5xl flex-col gap-6 px-5 py-8 md:px-8">
        <VistaRevision inicial={revision} />
      </main>
    </div>
  );
}
