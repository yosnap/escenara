import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { esAdmin, exigirSesion } from "@/server/auth/sesion";
import { obtenerProducto } from "@/server/productos/consulta";
import { ErrorProducto } from "@/server/productos/errores";
import { CabeceraApp } from "../../_app/cabecera-app";
import { FichaProducto } from "../_componentes/ficha-producto";

export const metadata: Metadata = { title: "Producto" };
export const dynamic = "force-dynamic";

/**
 * Ficha de un producto: sus datos y sus fotos con el papel de cada una. **Solo la ve su dueño**: uno de otra
 * persona responde 404, igual que un personaje ajeno, y no se dice que exista.
 */
export default async function PaginaProducto({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sesion = await exigirSesion(`/productos/${id}`);
  const actor = { id: sesion.user.id, esAdmin: esAdmin(sesion) };

  let producto: Awaited<ReturnType<typeof obtenerProducto>>;
  try {
    producto = await obtenerProducto(actor, id);
  } catch (error) {
    // Un producto ajeno o inexistente es la misma respuesta: la página de «no existe».
    if (error instanceof ErrorProducto && error.estado === 404) notFound();
    throw error;
  }

  return (
    <div className="min-h-dvh bg-fondo">
      <CabeceraApp sesion={sesion} />
      <main id="contenido" className="mx-auto flex max-w-4xl flex-col gap-6 px-5 py-8 md:px-8">
        <Link href="/productos" className="text-sm font-semibold text-acento underline">
          ← Volver a tus productos
        </Link>
        <FichaProducto inicial={producto} />
      </main>
    </div>
  );
}
