import type { Metadata } from "next";
import { formatosGenerables } from "@/lib/formatos";
import { leerAjustes } from "@/server/ajustes";
import { eleccionesDelPlan, listarProyectos, modelosDelPlan } from "@/server/asistente/plan";
import { esAdmin, exigirSesion } from "@/server/auth/sesion";
import { personajesElegibles } from "@/server/personajes/consulta";
import { CabeceraApp } from "../_app/cabecera-app";
import { ListaProyectos } from "./_componentes/lista-proyectos";

export const metadata: Metadata = { title: "Tus proyectos" };
export const dynamic = "force-dynamic";

/**
 * Proyectos de cada usuario (RF05): solo ve los suyos. Un proyecto agrupa la idea, el guion por escenas y el
 * plan con su coste estimado; desde la 0.17.0 es la unidad de trabajo del guion y del storyboard.
 */
export default async function PaginaProyectos() {
  const sesion = await exigirSesion("/proyectos");
  const actor = { id: sesion.user.id, esAdmin: esAdmin(sesion) };
  const [proyectos, personajes, ajustes, elecciones] = await Promise.all([
    listarProyectos(actor),
    personajesElegibles(actor),
    leerAjustes(),
    eleccionesDelPlan(actor.id),
  ]);

  return (
    <div className="min-h-dvh bg-fondo">
      <CabeceraApp sesion={sesion} />
      <main id="contenido" tabIndex={-1} className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-8 md:px-8">
        <div>
          <h1 className="text-4xl font-bold text-texto">Tus proyectos</h1>
          <p className="mt-2 max-w-2xl text-texto-suave">
            Describe una idea y conviértela en un guion por escenas con su coste estimado. Puedes escribirlo a mano de
            principio a fin; el asistente, si está encendido, solo propone y tú apruebas. Nada se genera hasta que
            apruebas el plan.
          </p>
        </div>
        <ListaProyectos
          inicial={proyectos}
          personajes={personajes}
          presupuestoSugerido={ajustes.presupuestoProyecto}
          formatosGenerables={formatosGenerables(modelosDelPlan(elecciones))}
        />
      </main>
    </div>
  );
}
