import type { Metadata } from "next";
import { listarPlantillas } from "@/server/prompts/consulta";
import { VistaPlantillas } from "./vista-plantillas";

export const metadata: Metadata = { title: "Plantillas · Admin · Escenara" };
export const dynamic = "force-dynamic";

/** Plantillas de prompt de la instalación (el layout del admin ya exige el rol). */
export default async function PaginaPlantillas() {
  const plantillas = await listarPlantillas();

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 md:px-8">
      <div>
        <h1 className="text-4xl font-bold text-texto">Plantillas de prompt</h1>
        <p className="mt-2 max-w-3xl text-texto-suave">
          El texto con el que se compone cada prompt, en inglés, con variables{" "}
          <span className="font-mono">{"{{así}}"}</span> que se rellenan con los presets que elige el usuario y con lo
          que escribe. Lo compone <strong className="font-semibold text-texto">siempre el servidor</strong>: el
          navegador manda qué plantilla y qué presets, nunca el texto.
        </p>
        <p className="mt-2 max-w-3xl text-texto-suave">
          Cambiar el texto, las variables o las restricciones{" "}
          <strong className="font-semibold text-texto">crea una versión nueva</strong> con su motivo. Cada trabajo cita
          la versión que usó, así que{" "}
          <strong className="font-semibold text-texto">editar una plantilla no cambia lo que ya se generó</strong>.
        </p>
      </div>
      <VistaPlantillas inicial={plantillas} />
    </main>
  );
}
