import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { claseBoton } from "@/components/ui/button";
import { leerAjustes } from "@/server/ajustes";
import { exigirSesion } from "@/server/auth/sesion";
import { CabeceraApp } from "../../_app/cabecera-app";
import { AltaPersonaje } from "./_componentes/alta-personaje";

export const metadata: Metadata = { title: "Nuevo personaje · Escenara" };
export const dynamic = "force-dynamic";

/** Alta de un personaje en pasos: tipo, nombre, fotos de referencia, consentimiento y resumen. */
export default async function PaginaNuevoPersonaje() {
  const sesion = await exigirSesion("/personajes/nuevo");
  const { minimoReferenciasPersonaje } = await leerAjustes();

  return (
    <div className="min-h-dvh bg-fondo">
      <CabeceraApp sesion={sesion} />
      <main id="contenido" className="mx-auto flex max-w-3xl flex-col gap-6 px-5 py-8 md:px-8">
        <div className="flex flex-col gap-3">
          <Link href="/personajes" className={claseBoton("fantasma", "sm", "self-start")}>
            <ArrowLeft className="size-4" aria-hidden /> Tus personajes
          </Link>
          <h1 className="text-4xl font-bold text-texto">Nuevo personaje</h1>
          <p className="max-w-2xl text-texto-suave">
            Necesitas {minimoReferenciasPersonaje} fotos de referencia y el consentimiento de uso de imagen. Sin
            consentimiento vigente el personaje no se puede usar para generar.
          </p>
        </div>
        <AltaPersonaje minimoReferencias={minimoReferenciasPersonaje} />
      </main>
    </div>
  );
}
