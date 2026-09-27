import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { claseBoton } from "@/components/ui/button";
import { esAdmin, exigirSesion } from "@/server/auth/sesion";
import { obtenerPersonaje } from "@/server/personajes/consulta";
import { ErrorPersonaje } from "@/server/personajes/errores";
import { CabeceraApp } from "../../_app/cabecera-app";
import { FichaPersonaje } from "./_componentes/ficha-personaje";

export const metadata: Metadata = { title: "Personaje · Escenara" };
export const dynamic = "force-dynamic";

/**
 * Ficha de un personaje. Un personaje ajeno responde 404, igual que en la biblioteca: no se revela que
 * existe. Quien administra puede leerlo para revisar su consentimiento, pero no editarlo (lo impide el
 * servidor, no la interfaz).
 */
export default async function PaginaPersonaje({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sesion = await exigirSesion(`/personajes/${id}`);
  const personaje = await obtenerPersonaje({ id: sesion.user.id, esAdmin: esAdmin(sesion) }, id).catch((error) => {
    if (error instanceof ErrorPersonaje && error.estado === 404) notFound();
    throw error;
  });

  return (
    <div className="min-h-dvh bg-fondo">
      <CabeceraApp sesion={sesion} />
      <main id="contenido" className="mx-auto flex max-w-4xl flex-col gap-6 px-5 py-8 md:px-8">
        <Link href="/personajes" className={claseBoton("fantasma", "sm", "self-start")}>
          <ArrowLeft className="size-4" aria-hidden /> Tus personajes
        </Link>
        <FichaPersonaje inicial={personaje} />
      </main>
    </div>
  );
}
