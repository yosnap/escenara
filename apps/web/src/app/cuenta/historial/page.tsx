import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { claseBoton } from "@/components/ui/button";
import { Cronologia, FiltrosHistorial, GastoPorMes } from "@/components/ui/datos/cronologia";
import { exigirSesion } from "@/server/auth/sesion";
import { filtroDeLaUrl, gastoPorMes, historialDe } from "@/server/datos/historial";
import { CabeceraApp } from "../../_app/cabecera-app";

export const metadata: Metadata = { title: "Tu historial" };
export const dynamic = "force-dynamic";

/**
 * Historial de la cuenta: todo lo que has hecho y gastado, en todos tus proyectos y en «Crear». Solo lo tuyo: cada
 * consulta va acotada por tu cuenta. Filtros y páginas por enlaces.
 */
export default async function PaginaHistorialCuenta({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sesion = await exigirSesion("/cuenta/historial");
  const filtro = filtroDeLaUrl(await searchParams);
  const [pagina, gasto] = await Promise.all([historialDe(sesion.user.id, filtro), gastoPorMes(sesion.user.id)]);
  const proyectos = [
    ...new Map(
      gasto.flatMap((g) =>
        g.proyectoId ? [[g.proyectoId, { id: g.proyectoId, titulo: g.proyectoTitulo ?? "" }] as const] : [],
      ),
    ).values(),
  ];
  const base = "/cuenta/historial";

  return (
    <div className="min-h-dvh bg-fondo">
      <CabeceraApp sesion={sesion} />
      <main id="contenido" tabIndex={-1} className="mx-auto flex max-w-4xl flex-col gap-6 px-5 py-8 md:px-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-4xl font-bold text-texto">Tu historial</h1>
            <p className="mt-2 max-w-2xl text-texto-suave">
              Lo que has generado, revisado, montado y exportado, y lo que ha costado, por proyecto y por mes.
            </p>
          </div>
          <Link href="/cuenta" className={claseBoton("fantasma", "sm")}>
            <ArrowLeft className="size-4" aria-hidden /> Volver a tu cuenta
          </Link>
        </div>
        <section
          aria-labelledby="gasto-cuenta"
          className="flex flex-col gap-3 rounded-tarjeta border border-borde bg-superficie p-6"
        >
          <h2 id="gasto-cuenta" className="text-xl font-bold text-texto">
            Gasto por mes y por proyecto
          </h2>
          <GastoPorMes filas={gasto} conProyecto />
        </section>
        <FiltrosHistorial
          base={base}
          filtro={filtro}
          meses={[...new Set(gasto.map((g) => g.mes))]}
          proyectos={proyectos}
        />
        <Cronologia eventos={pagina.eventos} base={base} filtro={filtro} hayMas={pagina.hayMas} conProyecto />
      </main>
    </div>
  );
}
