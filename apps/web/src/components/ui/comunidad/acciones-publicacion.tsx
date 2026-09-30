"use client";

import { Pencil, Trash2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import type { MiPublicacionVista } from "@/lib/comunidad";
import { Boton } from "../button";

/** Los diálogos se descargan al pulsar: casi nadie los abre y la comunidad ya pinta muchas tarjetas. */
const DialogoEditarPublicacion = dynamic(
  () => import("./dialogos-publicacion").then((m) => m.DialogoEditarPublicacion),
  { ssr: false },
);
const DialogoRetirarPublicacion = dynamic(
  () => import("./dialogos-publicacion").then((m) => m.DialogoRetirarPublicacion),
  { ssr: false },
);

/**
 * Acciones del autor sobre su publicación: **editar** (vuelve a moderación y deja de verse hasta que se apruebe) y
 * **retirar** (borra la copia publicada; el original no cambia). Las dos con su diálogo, nunca `confirm()`.
 */
export function AccionesPublicacion({ publicacion }: { publicacion: MiPublicacionVista }) {
  const [editando, setEditando] = useState(false);
  const [retirando, setRetirando] = useState(false);
  return (
    <div className="flex flex-wrap gap-2">
      {!publicacion.huerfana && (
        <Boton
          variante="secundario"
          tamano="sm"
          icono={<Pencil className="size-4" />}
          onClick={() => setEditando(true)}
        >
          Editar
        </Boton>
      )}
      <Boton variante="secundario" tamano="sm" icono={<Trash2 className="size-4" />} onClick={() => setRetirando(true)}>
        Retirar
      </Boton>
      {editando && (
        <DialogoEditarPublicacion publicacion={publicacion} abierto={editando} onAbiertoCambio={setEditando} />
      )}
      {retirando && (
        <DialogoRetirarPublicacion publicacion={publicacion} abierto={retirando} onAbiertoCambio={setRetirando} />
      )}
    </div>
  );
}
