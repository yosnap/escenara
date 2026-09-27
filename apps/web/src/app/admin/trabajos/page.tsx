import { desc } from "drizzle-orm";
import type { Metadata } from "next";
import { trabajosConExceso, trabajosEnRevision } from "@/server/cola/revision";
import { db } from "@/server/db/cliente";
import { queueWorkers } from "@/server/db/esquema";
import { VistaRevisionTrabajos } from "./vista-revision-trabajos";

export const metadata: Metadata = { title: "Trabajos en revisión · Admin · Escenara" };
export const dynamic = "force-dynamic";

/**
 * Trabajos que se quedaron sin respuesta del proveedor y cuya reserva de presupuesto sigue apartada, más el
 * estado de los workers de la cola (el layout del admin ya exige el rol).
 */
export default async function PaginaAdminTrabajos() {
  const [trabajos, excesos, workers] = await Promise.all([
    trabajosEnRevision(),
    trabajosConExceso(),
    db().select().from(queueWorkers).orderBy(desc(queueWorkers.seenAt)).limit(20),
  ]);
  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-10 md:px-8">
      <div>
        <h1 className="text-4xl font-bold text-texto">Trabajos en revisión</h1>
        <p className="mt-2 max-w-3xl text-texto-suave">
          Estos trabajos quedaron sin respuesta del proveedor, así que no se sabe si se cobraron. Su reserva de
          presupuesto sigue apartada a propósito. Comprueba la tarea en el panel del proveedor y ciérralos aquí con los
          créditos reales; nada se reenvía nunca desde esta página.
        </p>
      </div>
      <VistaRevisionTrabajos
        iniciales={trabajos}
        excesos={excesos}
        workers={workers.map((w) => ({
          id: w.id,
          arrancado: w.startedAt.toISOString(),
          visto: w.seenAt.toISOString(),
          atendidos: w.handled,
        }))}
      />
    </main>
  );
}
