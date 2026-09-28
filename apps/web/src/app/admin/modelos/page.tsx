import type { Metadata } from "next";
import { TIPOS_EN_USO } from "@/lib/mapa-modelos";
import { db } from "@/server/db/cliente";
import { modelMapEntries } from "@/server/db/esquema";
import { opcionesRecomendables, recomendadasDe } from "@/server/mapa/mapa";
import { historialCatalogo, listarModelos } from "@/server/proveedores/catalogo";
import { proveedoresConAdaptador } from "@/server/proveedores/registro";
import { Recomendadas, type TipoRecomendable } from "./recomendadas";
import { VistaModelos } from "./vista-modelos";

export const metadata: Metadata = { title: "Modelos · Admin · Escenara" };
export const dynamic = "force-dynamic";

/** Catálogo de proveedores y modelos (el layout del admin ya exige el rol). */
export default async function PaginaModelos() {
  const [modelos, historial] = await Promise.all([listarModelos(), historialCatalogo()]);
  const escritas = await db().select({ kind: modelMapEntries.kind }).from(modelMapEntries);
  const tipos: TipoRecomendable[] = await Promise.all(
    TIPOS_EN_USO.map(async (tipo) => ({
      tipo,
      entradas: await recomendadasDe(tipo),
      opciones: await opcionesRecomendables(tipo),
      // Deducidas del catálogo mientras nadie haya escrito la recomendación de ese tipo.
      deducidas: !escritas.some((e) => e.kind === tipo),
    })),
  );

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
      <Recomendadas tipos={tipos} />
      <VistaModelos inicial={modelos} historialInicial={historial} conAdaptador={proveedoresConAdaptador} />
    </main>
  );
}
