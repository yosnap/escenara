import { Wand2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { claseBoton } from "@/components/ui/button";
import { DepositoPresupuesto } from "@/components/ui/deposito";
import { exigirSesion } from "@/server/auth/sesion";
import { estadoDeCola } from "@/server/cola/latido";
import { listarTrabajos } from "@/server/generacion/trabajos";
import { depositoDe } from "@/server/presupuesto/deposito";
import { CabeceraApp } from "../../_app/cabecera-app";
import { ListaTrabajos } from "./_componentes/lista-trabajos";

export const metadata: Metadata = { title: "Historial de generaciones · Escenara" };
export const dynamic = "force-dynamic";

/**
 * Historial de lo generado por quien consulta. Nadie ve los trabajos de otra persona.
 *
 * Desde 0.12.0 esta página **solo lee**: quien avanza los trabajos es el worker de la cola, así que abrir el
 * historial no dispara consultas al proveedor. Lo que se ve es el estado real guardado.
 */
export default async function PaginaHistorial() {
  const sesion = await exigirSesion("/crear/historial");
  const [trabajos, deposito, cola] = await Promise.all([
    listarTrabajos(sesion.user.id),
    depositoDe(sesion.user.id),
    estadoDeCola(sesion.user.id),
  ]);
  return (
    <div className="min-h-dvh bg-fondo">
      <CabeceraApp sesion={sesion} />
      <main id="contenido" className="mx-auto flex max-w-4xl flex-col gap-6 px-5 py-8 md:px-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-4xl font-bold text-texto">Historial de generaciones</h1>
            <p className="mt-2 max-w-2xl text-texto-suave">
              Todo lo que has pedido, con su estado real en el proveedor, los créditos y el archivo resultante.
            </p>
          </div>
          <Link href="/crear" className={claseBoton("chispa", "sm")}>
            <Wand2 className="size-4" aria-hidden /> Crear
          </Link>
        </div>
        <DepositoPresupuesto deposito={deposito} cola={cola} />
        <ListaTrabajos iniciales={trabajos} cola={cola} />
      </main>
    </div>
  );
}
