import type { Metadata } from "next";
import { listarPresetsDeLaInstalacion } from "@/server/prompts/consulta";
import { VistaPresets } from "./vista-presets";

export const metadata: Metadata = { title: "Presets · Admin · Escenara" };
export const dynamic = "force-dynamic";

/** Catálogo de presets de la instalación (el layout del admin ya exige el rol). */
export default async function PaginaPresets() {
  const presets = await listarPresetsDeLaInstalacion();

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 md:px-8">
      <div>
        <h1 className="text-4xl font-bold text-texto">Presets</h1>
        <p className="mt-2 max-w-3xl text-texto-suave">
          Los botones de «Crear»: especialidad, formato, look, vestuario, duración y acción. La{" "}
          <strong className="font-semibold text-texto">descripción</strong> se lee en el botón y va en español; el{" "}
          <strong className="font-semibold text-texto">texto del prompt</strong> es lo que entra en el prompt y va en
          inglés, porque los modelos responden mejor. Un formato o una duración solo se ofrecen si el modelo elegido los
          admite según el catálogo: lo que no, sale deshabilitado con su motivo.
        </p>
        <p className="mt-2 max-w-3xl text-texto-suave">
          Aquí se editan los de <strong className="font-semibold text-texto">esta instalación</strong>. Cada usuario
          puede duplicar uno desde «Crear» para hacerlo suyo, y esa copia es solo suya: no aparece en esta lista.
        </p>
      </div>
      <VistaPresets inicial={presets} />
    </main>
  );
}
