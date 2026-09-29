import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { leerAjustes } from "@/server/ajustes";
import { datosDelAnuncio } from "@/server/anuncio/pantalla";
import { ErrorProyecto } from "@/server/asistente/errores";
import { detalleProyecto } from "@/server/asistente/plan";
import { esAdmin, exigirSesion } from "@/server/auth/sesion";
import { personajesElegibles } from "@/server/personajes/consulta";
import { listarPlantillas } from "@/server/prompts/consulta";
import { vistaPublicaTrend } from "@/server/prompts/trends";
import { CabeceraApp } from "../../_app/cabecera-app";
import { VistaProyecto } from "./_componentes/vista-proyecto";

export const metadata: Metadata = { title: "Proyecto · Escenara" };
export const dynamic = "force-dynamic";

/**
 * Un proyecto: brief del anuncio → idea y concepto → guion por escenas → plan con su coste. Un proyecto que no es tuyo responde
 * como si no existiera, también para quien administra (`server/asistente/consulta.ts`).
 */
export default async function PaginaProyecto({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await exigirSesion("/proyectos");
  const actor = { id: sesion.user.id, esAdmin: esAdmin(sesion) };
  const { id } = await params;
  const detalle = await detalleProyecto(actor, id).catch((error: unknown) => {
    if (error instanceof ErrorProyecto && error.estado === 404) notFound();
    throw error;
  });
  // El brief del anuncio se lee aquí, con el proyecto: así el primer pintado ya enseña el ángulo, la oferta y el
  // precio de verdad, y la pantalla no necesita ningún efecto que dispare peticiones al montarse.
  const [personajes, anuncio, ajustes, plantillas] = await Promise.all([
    personajesElegibles(actor),
    datosDelAnuncio(actor, detalle.proyecto.id),
    leerAjustes(),
    listarPlantillas({ usuarioId: actor.id }),
  ]);
  const trends = ajustes.trendsVisibles
    ? plantillas
        .filter((p) => p.kind === "trend" && p.deLaInstalacion && p.activa && p.trendStatus === "vigente")
        .map(vistaPublicaTrend)
    : [];

  return (
    <div className="min-h-dvh bg-fondo">
      <CabeceraApp sesion={sesion} />
      <main id="contenido" className="mx-auto flex max-w-5xl flex-col gap-6 px-5 py-8 md:px-8">
        <VistaProyecto inicial={detalle} personajes={personajes} anuncio={anuncio} trends={trends} />
      </main>
    </div>
  );
}
