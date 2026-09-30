import type { Metadata } from "next";
import { esAdmin, exigirSesion } from "@/server/auth/sesion";
import { listarProductos } from "@/server/productos/consulta";
import { CabeceraApp } from "../_app/cabecera-app";
import { ListaProductos } from "./_componentes/lista-productos";

export const metadata: Metadata = { title: "Tus productos" };
export const dynamic = "force-dynamic";

/**
 * Productos de cada usuario (0.26.0): solo ve los suyos. Un producto guarda sus fotos de referencia con el
 * papel que hace cada una, y es lo que se elige en una escena para que el personaje lo presente.
 */
export default async function PaginaProductos() {
  const sesion = await exigirSesion("/productos");
  const productos = await listarProductos({ id: sesion.user.id, esAdmin: esAdmin(sesion) });

  return (
    <div className="min-h-dvh bg-fondo">
      <CabeceraApp sesion={sesion} />
      <main id="contenido" className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-8 md:px-8">
        <div>
          <h1 className="text-4xl font-bold text-texto">Tus productos</h1>
          <p className="mt-2 max-w-2xl text-texto-suave">
            Lo que el personaje presenta y manipula: un bote, una caja, una prenda o una app. Con sus fotos de
            referencia y el papel de cada una, para que la etiqueta y el envase salgan como son. Al borrarlo desaparecen
            también los fotogramas y vídeos que hayas hecho con él.
          </p>
        </div>
        <ListaProductos inicial={productos} />
      </main>
    </div>
  );
}
