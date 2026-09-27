import { UserRoundPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { claseBoton } from "@/components/ui/button";
import { esAdmin, exigirSesion } from "@/server/auth/sesion";
import { listarPersonajes } from "@/server/personajes/consulta";
import { CabeceraApp } from "../_app/cabecera-app";
import { ListaPersonajes } from "./_componentes/lista-personajes";

export const metadata: Metadata = { title: "Tus personajes · Escenara" };
export const dynamic = "force-dynamic";

/**
 * Personajes de cada usuario (RF02): solo ve los suyos. El estado se calcula en el servidor a partir del
 * consentimiento y de las fotos que tiene, así que lo que se muestra es lo que de verdad decide si se puede
 * generar con él.
 */
export default async function PaginaPersonajes() {
  const sesion = await exigirSesion("/personajes");
  const personajes = await listarPersonajes({ id: sesion.user.id, esAdmin: esAdmin(sesion) });

  return (
    <div className="min-h-dvh bg-fondo">
      <CabeceraApp sesion={sesion} />
      <main id="contenido" className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-8 md:px-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-4xl font-bold text-texto">Tus personajes</h1>
            <p className="mt-2 max-w-2xl text-texto-suave">
              Una persona o un animal con sus fotos de referencia y su consentimiento de uso de imagen. Sin
              consentimiento vigente no se puede generar con él, y al borrarlo desaparecen también los vídeos y
              fotogramas que hayas hecho con él.
            </p>
          </div>
          <Link href="/personajes/nuevo" className={claseBoton("chispa")}>
            <UserRoundPlus className="size-5" aria-hidden /> Nuevo personaje
          </Link>
        </div>
        <ListaPersonajes inicial={personajes} />
      </main>
    </div>
  );
}
