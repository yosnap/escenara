import type { Metadata } from "next";
import Link from "next/link";
import { SoloEnCliente } from "@/components/ui/solo-en-cliente";
import { esAdmin, exigirSesion } from "@/server/auth/sesion";
import { fotogramaDeMuestra, leerKit } from "@/server/marca/kit";
import { CabeceraApp } from "../../_app/cabecera-app";
import { EditorKit } from "./_componentes/editor-kit";

export const metadata: Metadata = { title: "Tu kit de marca" };
export const dynamic = "force-dynamic";

/** Kit de marca del creador: solo el suyo, para sus exportaciones. */
export default async function PaginaKit() {
  const sesion = await exigirSesion("/cuenta/kit");
  const actor = { id: sesion.user.id, esAdmin: esAdmin(sesion) };
  const [kit, fotograma] = await Promise.all([leerKit(actor), fotogramaDeMuestra(actor.id)]);
  return (
    <div className="min-h-dvh bg-fondo">
      <CabeceraApp sesion={sesion} />
      <main id="contenido" tabIndex={-1} className="mx-auto flex max-w-5xl flex-col gap-6 px-5 py-10 md:px-8">
        <div>
          <Link href="/cuenta" className="text-sm font-semibold text-acento hover:underline">
            ← Tu cuenta
          </Link>
          <h1 className="mt-2 text-4xl font-bold text-texto">Tu kit de marca</h1>
          <p className="mt-2 max-w-3xl text-texto-suave">
            Tu logotipo en una esquina de los vídeos que exportes. Es solo tuyo: no cambia nada de la instalación y no
            lo ve nadie más.
          </p>
        </div>
        <SoloEnCliente
          reserva={
            <p role="status" className="rounded-tarjeta border-2 border-borde bg-superficie p-6 text-texto-suave">
              Cargando tu kit…
            </p>
          }
        >
          <EditorKit kitInicial={kit} fotograma={fotograma} />
        </SoloEnCliente>
      </main>
    </div>
  );
}
