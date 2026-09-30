import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { claseBoton } from "@/components/ui/button";
import { leerAjustes } from "@/server/ajustes";
import { exigirSesion } from "@/server/auth/sesion";
import { CabeceraApp } from "../../_app/cabecera-app";
import { AltaPersonaje } from "./_componentes/alta-personaje";

export const metadata: Metadata = { title: "Nuevo personaje" };
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
        {/* El otro camino: un personaje que no existe y cuya cara se genera. No pide fotos ni consentimiento
            de nadie, porque no hay nadie a quien pedírselo. */}
        <div className="flex flex-col gap-2 rounded-tarjeta border-2 border-borde bg-superficie p-5">
          <p className="font-semibold text-texto">¿No es una persona real?</p>
          <p className="text-texto-suave">
            Un personaje inventado nace de una descripción: se generan cuatro retratos y eliges uno. No admite fotos de
            personas reales y todo lo que genere queda marcado como contenido sintético.
          </p>
          <Link href="/personajes/nuevo/inventado" className={claseBoton("secundario", "sm", "self-start")}>
            Crear un personaje inventado
          </Link>
        </div>
        <AltaPersonaje minimoReferencias={minimoReferenciasPersonaje} />
      </main>
    </div>
  );
}
