import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ErrorProyecto } from "@/server/asistente/errores";
import { esAdmin, exigirSesion } from "@/server/auth/sesion";
import { ErrorMontaje } from "@/server/montaje/errores";
import { montajeDelProyecto } from "@/server/montaje/servicio";
import { montajeParaLaVista } from "@/server/montaje/vista";
import { CabeceraApp } from "../../../_app/cabecera-app";
import { VistaMontaje } from "./_componentes/vista-montaje";

export const metadata: Metadata = { title: "Montaje y exportación" };
export const dynamic = "force-dynamic";

/**
 * Montaje y exportación de un proyecto (RF08, 0.32.0): la línea de tiempo con sus recortes, la mezcla de voz y
 * música, los subtítulos, la etiqueta de contenido sintético y el MP4 vertical que sale de todo eso.
 *
 * Todo se **lee en el servidor al abrir**: la línea de tiempo, las escenas con su clip, las exportaciones y la
 * comprobación previa llegan en el HTML, así que la pantalla no arranca vacía ni consulta nada para pintarse.
 *
 * Lo monta **el dueño del proyecto**: un proyecto que no es tuyo responde como si no existiera, también para quien
 * administra (misma regla que la revisión de la 0.20.0 y que la voz de la 0.21.0).
 */
export default async function PaginaMontaje({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await exigirSesion("/proyectos");
  const actor = { id: sesion.user.id, esAdmin: esAdmin(sesion) };
  const { id } = await params;
  const { montaje, material } = await montajeDelProyecto(actor, id).catch((error: unknown) => {
    if (error instanceof ErrorProyecto && error.estado === 404) notFound();
    if (error instanceof ErrorMontaje && error.estado === 404) notFound();
    throw error;
  });
  const vista = await montajeParaLaVista(actor, montaje, material);

  return (
    <div className="min-h-dvh bg-fondo">
      <CabeceraApp sesion={sesion} />
      <main id="contenido" className="mx-auto flex max-w-5xl flex-col gap-6 px-5 py-8 md:px-8">
        <VistaMontaje inicial={vista} titulo={material.proyecto.title} />
      </main>
    </div>
  );
}
