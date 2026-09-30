import type { Metadata } from "next";
import { SoloEnCliente } from "@/components/ui/solo-en-cliente";
import { esAdmin, exigirAdmin } from "@/server/auth/sesion";
import { estadoDeLaMarca } from "@/server/marca/instalacion";
import { EditorMarca } from "./_componentes/editor-marca";

export const metadata: Metadata = { title: "Marca · Admin" };
export const dynamic = "force-dynamic";

/**
 * Marca de la instalación. El layout del admin ya exige el rol; la página lo vuelve a exigir y cada ruta de la API que
 * cambia algo, también: la puerta no depende de por dónde se entre.
 */
export default async function PaginaMarca() {
  const sesion = await exigirAdmin("/admin/marca");
  const estado = await estadoDeLaMarca({ id: sesion.user.id, esAdmin: esAdmin(sesion) });
  return (
    <main id="contenido" tabIndex={-1} className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 md:px-8">
      <div>
        <h1 className="text-4xl font-bold text-texto">Marca de la instalación</h1>
        <p className="mt-2 max-w-3xl text-texto-suave">
          Logotipo, textos, tipografía y colores de los dos temas de esta instalación. Se guardan como borrador, se
          previsualizan en claro y en oscuro a la vez y se publican de golpe; cada versión publicada queda en el
          historial para volver a ella con un clic. Es la marca de la instalación: el kit de cada creador para sus
          vídeos va aparte, en su cuenta.
        </p>
      </div>
      <SoloEnCliente
        reserva={
          <p role="status" className="rounded-tarjeta border-2 border-borde bg-superficie p-6 text-texto-suave">
            Cargando el editor de la marca…
          </p>
        }
      >
        <EditorMarca estadoInicial={estado} />
      </SoloEnCliente>
    </main>
  );
}
