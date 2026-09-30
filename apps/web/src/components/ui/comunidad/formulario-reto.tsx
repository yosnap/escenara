"use client";

import { Plus, Trash2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { fechaCorta, type RetoVista } from "@/lib/comunidad";
import { Boton } from "../button";

/** El diálogo de borrar se descarga al pulsar. */
const DialogoBorrarReto = dynamic(() => import("./dialogo-borrar-reto").then((m) => m.DialogoBorrarReto), {
  ssr: false,
});

/** El formulario de un reto nuevo se descarga al pulsar «Nuevo reto». */
const FormularioNuevoReto = dynamic(() => import("./formulario-nuevo-reto").then((m) => m.FormularioNuevoReto), {
  ssr: false,
});

/** Retos para quien administra: crear (título, periodo y plantilla sugerida) y borrar, con su diálogo. */
export function GestionRetos({
  retos,
  plantillas,
}: {
  retos: RetoVista[];
  plantillas: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const [aBorrar, setABorrar] = useState<RetoVista | null>(null);
  const [creando, setCreando] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <ul className="flex flex-col gap-2">
        {retos.map((r) => (
          <li
            key={r.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-tarjeta border border-borde bg-superficie p-3"
          >
            <span className="flex flex-col">
              <span className="font-semibold text-texto">{r.titulo}</span>
              <span className="text-sm text-texto-suave">
                Del {fechaCorta(r.desde)} al {fechaCorta(r.hasta)} · {r.vigente ? "abierto" : "cerrado"} ·{" "}
                {r.participaciones} participación(es) publicadas
                {r.plantilla ? ` · sugiere «${r.plantilla.nombre}»` : ""}
              </span>
            </span>
            <Boton
              variante="secundario"
              tamano="sm"
              icono={<Trash2 className="size-4" />}
              onClick={() => setABorrar(r)}
            >
              Borrar
            </Boton>
          </li>
        ))}
      </ul>
      {creando ? (
        <FormularioNuevoReto
          plantillas={plantillas}
          onCreado={() => {
            setCreando(false);
            router.refresh();
          }}
        />
      ) : (
        <Boton icono={<Plus className="size-4" />} onClick={() => setCreando(true)} className="self-start">
          Nuevo reto
        </Boton>
      )}
      {aBorrar && (
        <DialogoBorrarReto
          reto={aBorrar}
          onCerrar={() => setABorrar(null)}
          onBorrado={() => {
            setABorrar(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
