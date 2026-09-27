import type { Metadata } from "next";
import { historialCatalogo, listarModelos } from "@/server/proveedores/catalogo";
import { proveedoresConAdaptador } from "@/server/proveedores/registro";
import { VistaModelos } from "./vista-modelos";

export const metadata: Metadata = { title: "Modelos · Admin · Escenara" };
export const dynamic = "force-dynamic";

/** Catálogo de proveedores y modelos (el layout del admin ya exige el rol). */
export default async function PaginaModelos() {
  const [modelos, historial] = await Promise.all([listarModelos(), historialCatalogo()]);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 md:px-8">
      <div>
        <h1 className="text-4xl font-bold text-texto">Modelos</h1>
        <p className="mt-2 max-w-3xl text-texto-suave">
          Catálogo de esta instalación: qué sabe hacer cada modelo, qué parámetros se le han comprobado, cuánto cuesta y
          cuándo se midió. El estado lo cambias tú: <strong className="font-semibold text-texto">validado</strong> exige
          evidencia (coste medido y ejemplo o informe), y un modelo{" "}
          <strong className="font-semibold text-texto">retirado</strong> no se puede elegir ni enviar. Cambiar un precio
          caduca las estimaciones que alguien tuviera en pantalla; los créditos ya consumidos no se tocan.
        </p>
      </div>
      <VistaModelos inicial={modelos} historialInicial={historial} conAdaptador={proveedoresConAdaptador} />
    </main>
  );
}
