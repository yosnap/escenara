"use client";

import { History, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Boton, claseBoton } from "@/components/ui/button";
import type { VistaExportacionProyecto } from "./api-datos";
import { DialogoBorrarProyecto } from "./dialogo-borrar-proyecto";
import { ExportarProyecto } from "./exportar-proyecto";

/** «Tus datos» del proyecto, bajo su cabecera: su historial, exportarlo en ZIP y borrarlo con todo lo suyo. */
export function DatosDelProyecto({
  proyectoId,
  titulo,
  ultimaExportacion,
}: {
  proyectoId: string;
  titulo: string;
  ultimaExportacion: VistaExportacionProyecto | null;
}) {
  const router = useRouter();
  const [borrar, setBorrar] = useState(false);
  return (
    <section
      aria-label="Historial, exportación y borrado del proyecto"
      className="flex flex-wrap items-start justify-between gap-3 rounded-tarjeta border border-borde bg-superficie p-4"
    >
      <ExportarProyecto proyectoId={proyectoId} inicial={ultimaExportacion} />
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/proyectos/${proyectoId}/historial`} className={claseBoton("fantasma", "sm")}>
          <History className="size-4" aria-hidden /> Historial y gasto
        </Link>
        <Boton variante="fantasma" tamano="sm" icono={<Trash2 className="size-4" />} onClick={() => setBorrar(true)}>
          Borrar proyecto
        </Boton>
      </div>
      <DialogoBorrarProyecto
        proyectoId={proyectoId}
        titulo={titulo}
        abierto={borrar}
        onAbiertoCambio={setBorrar}
        onBorrado={() => router.push("/proyectos")}
      />
    </section>
  );
}
