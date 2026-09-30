import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { claseBoton } from "@/components/ui/button";
import { Cronologia, FiltrosHistorial, GastoPorMes } from "@/components/ui/datos/cronologia";
import { proyectoPropio } from "@/server/asistente/consulta";
import { ErrorProyecto } from "@/server/asistente/errores";
import { esAdmin, exigirSesion } from "@/server/auth/sesion";
import { filtroDeLaUrl, gastoDelProyecto, gastoPorMes, historialDe } from "@/server/datos/historial";
import { CabeceraApp } from "../../../_app/cabecera-app";

export const metadata: Metadata = { title: "Historial del proyecto" };
export const dynamic = "force-dynamic";

/**
 * Historial de un proyecto: todo lo que se ha generado, revisado, montado y exportado en él, y su gasto por mes. Un
 * proyecto ajeno responde como si no existiera. Filtros y páginas por enlaces: no carga nada en el navegador.
 */
export default async function PaginaHistorialProyecto({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sesion = await exigirSesion(`/proyectos/${id}/historial`);
  const actor = { id: sesion.user.id, esAdmin: esAdmin(sesion) };
  const proyecto = await proyectoPropio(actor, id).catch((error: unknown) => {
    if (error instanceof ErrorProyecto && error.estado === 404) notFound();
    throw error;
  });
  const filtro = { ...filtroDeLaUrl(await searchParams), proyectoId: proyecto.id };
  const [pagina, gasto, totales] = await Promise.all([
    historialDe(actor.id, filtro),
    gastoPorMes(actor.id, proyecto.id),
    gastoDelProyecto(proyecto.id),
  ]);
  const base = `/proyectos/${proyecto.id}/historial`;
  const creditos = (n: number) => n.toLocaleString("es-ES", { maximumFractionDigits: 1 });

  return (
    <div className="min-h-dvh bg-fondo">
      <CabeceraApp sesion={sesion} />
      <main id="contenido" tabIndex={-1} className="mx-auto flex max-w-4xl flex-col gap-6 px-5 py-8 md:px-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-4xl font-bold text-texto">Historial del proyecto</h1>
            <p className="mt-2 max-w-2xl text-texto-suave">
              «{proyecto.title || "Sin título"}»: cada generación, revisión, montaje y exportación, con lo que costó.
            </p>
          </div>
          <Link href={`/proyectos/${proyecto.id}`} className={claseBoton("fantasma", "sm")}>
            <ArrowLeft className="size-4" aria-hidden /> Volver al proyecto
          </Link>
        </div>
        <section
          aria-labelledby="gasto-proyecto"
          className="flex flex-col gap-3 rounded-tarjeta border border-borde bg-superficie p-6"
        >
          <h2 id="gasto-proyecto" className="text-xl font-bold text-texto">
            Gasto
          </h2>
          <p className="text-texto-suave">
            Estimado al pedir: <strong className="text-texto">{creditos(totales.estimado)} créditos</strong> · Consumido
            de verdad: <strong className="text-texto">{creditos(totales.consumido)} créditos</strong>.
          </p>
          <GastoPorMes filas={gasto} />
        </section>
        <FiltrosHistorial base={base} filtro={filtro} meses={[...new Set(gasto.map((g) => g.mes))]} />
        <Cronologia eventos={pagina.eventos} base={base} filtro={filtro} hayMas={pagina.hayMas} />
      </main>
    </div>
  );
}
