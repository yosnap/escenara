import type { Metadata } from "next";
import { esAdmin, exigirSesion } from "@/server/auth/sesion";
import { listarLugares } from "@/server/lugares/consulta";
import { CabeceraApp } from "../_app/cabecera-app";
import { ListaLugares } from "./_componentes/lista-lugares";

export const metadata: Metadata = { title: "Tus lugares" };
export const dynamic = "force-dynamic";

/**
 * Lugares de cada usuario: solo ve los suyos. Un lugar es un sitio poco conocido que se reutiliza como escenario,
 * con sus fotos (la maestra es la que se envía) y su declaración de derechos.
 */
export default async function PaginaLugares() {
  const sesion = await exigirSesion("/lugares");
  const lugares = await listarLugares({ id: sesion.user.id, esAdmin: esAdmin(sesion) });

  return (
    <div className="min-h-dvh bg-fondo">
      <CabeceraApp sesion={sesion} />
      <main id="contenido" tabIndex={-1} className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-8 md:px-8">
        <div>
          <h1 className="text-4xl font-bold text-texto">Tus lugares</h1>
          <p className="mt-2 max-w-2xl text-texto-suave">
            Una calle, un bar de barrio o un patio que quieres usar como escenario una y otra vez. Con sus fotos y una
            maestra, para que el sitio salga igual en todas tus escenas. Al borrarlo, tus fotos y lo que hayas generado
            con él se quedan en tu biblioteca.
          </p>
        </div>
        <ListaLugares inicial={lugares} />
      </main>
    </div>
  );
}
