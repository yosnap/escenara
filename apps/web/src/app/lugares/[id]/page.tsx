import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { esAdmin, exigirSesion } from "@/server/auth/sesion";
import { obtenerLugar } from "@/server/lugares/consulta";
import { ErrorLugar } from "@/server/lugares/errores";
import { CabeceraApp } from "../../_app/cabecera-app";
import { FichaLugar } from "../_componentes/ficha-lugar";

export const metadata: Metadata = { title: "Lugar" };
export const dynamic = "force-dynamic";

/** Ficha de un lugar. **Solo la ve su dueño**: uno de otra persona responde 404 y no se dice que exista. */
export default async function PaginaLugar({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sesion = await exigirSesion(`/lugares/${id}`);
  const actor = { id: sesion.user.id, esAdmin: esAdmin(sesion) };

  let lugar: Awaited<ReturnType<typeof obtenerLugar>>;
  try {
    lugar = await obtenerLugar(actor, id);
  } catch (error) {
    // Un lugar ajeno o inexistente es la misma respuesta: la página de «no existe».
    if (error instanceof ErrorLugar && error.estado === 404) notFound();
    throw error;
  }

  return (
    <div className="min-h-dvh bg-fondo">
      <CabeceraApp sesion={sesion} />
      <main id="contenido" tabIndex={-1} className="mx-auto flex max-w-4xl flex-col gap-6 px-5 py-8 md:px-8">
        <Link href="/lugares" className="text-sm font-semibold text-acento underline">
          ← Volver a tus lugares
        </Link>
        <FichaLugar inicial={lugar} />
      </main>
    </div>
  );
}
