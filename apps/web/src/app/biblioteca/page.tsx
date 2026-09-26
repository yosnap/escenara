import type { Metadata } from "next";
import { esAdmin, exigirSesion } from "@/server/auth/sesion";
import { listarColecciones } from "@/server/media/colecciones";
import { espacioUsado } from "@/server/media/servicio";
import { CabeceraApp } from "../_app/cabecera-app";
import { VistaBiblioteca } from "./_componentes/vista-biblioteca";

export const metadata: Metadata = { title: "Tu biblioteca · Escenara" };
export const dynamic = "force-dynamic";

/** Biblioteca de medios de cada usuario: solo ve lo suyo, con sus colecciones y su espacio usado. */
export default async function PaginaBiblioteca() {
  const sesion = await exigirSesion("/biblioteca");
  const actor = { id: sesion.user.id, esAdmin: esAdmin(sesion) };
  const [colecciones, espacio] = await Promise.all([listarColecciones(actor), espacioUsado(actor)]);
  return (
    <div className="min-h-dvh bg-fondo">
      <CabeceraApp sesion={sesion} />
      <main id="contenido" className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-8 md:px-8">
        <div>
          <h1 className="text-4xl font-bold text-texto">Tu biblioteca</h1>
          <p className="mt-2 text-texto-suave">
            Tus fotos, vídeos y audios, ordenados en colecciones. Solo tú los ves.
          </p>
        </div>
        <VistaBiblioteca colecciones={colecciones} espacio={espacio} />
      </main>
    </div>
  );
}
