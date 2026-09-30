"use client";

import { FolderPlus, Library, Pencil, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Boton, BotonIcono } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Aviso } from "@/components/ui/feedback";
import { EntradaTexto } from "@/components/ui/field";
import { borrarColeccion, crearColeccion, renombrarColeccion } from "@/components/ui/media/api-medios";
import { Dialogo } from "@/components/ui/overlay";
import type { Coleccion } from "@/lib/media/tipos";

const claseItem =
  "flex min-h-11 w-full items-center gap-2 rounded-control px-3 text-left text-sm font-semibold transition-colors duration-(--motion-fast) hover:bg-elevada aria-[current=true]:bg-acento aria-[current=true]:text-sobre-acento";

/** Colecciones del usuario: elegir, crear, renombrar y borrar (los archivos no se borran). */
export function ListaColecciones({
  colecciones,
  activa,
  onElegir,
  onCambio,
}: {
  colecciones: Coleccion[];
  activa: string | null;
  onElegir: (id: string | null) => void;
  onCambio: () => void;
}) {
  const [nueva, setNueva] = useState("");
  const [editando, setEditando] = useState<Coleccion | null>(null);
  const [nombre, setNombre] = useState("");
  const [aBorrar, setABorrar] = useState<Coleccion | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ejecutar = async (accion: Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    const r = await accion;
    if (!r.ok) {
      setError(r.error ?? "No se ha podido completar la operación.");
      return false;
    }
    onCambio();
    return true;
  };

  const crear = async (evento: FormEvent) => {
    evento.preventDefault();
    if (await ejecutar(crearColeccion(nueva))) setNueva("");
  };

  return (
    <nav aria-label="Colecciones" className="flex flex-col gap-3">
      <ul className="flex flex-col gap-1">
        <li>
          <button type="button" aria-current={activa === null} onClick={() => onElegir(null)} className={claseItem}>
            <Library className="size-4" aria-hidden /> Todos tus archivos
          </button>
        </li>
        {colecciones.map((c) => (
          <li key={c.id} className="group flex items-center gap-1">
            <button
              type="button"
              aria-current={activa === c.id}
              onClick={() => onElegir(c.id)}
              className={cn(claseItem, "min-w-0 flex-1")}
            >
              <span className="truncate">{c.nombre}</span>
              <span className="ml-auto font-mono text-xs">{c.total}</span>
            </button>
            <BotonIcono
              etiqueta={`Renombrar ${c.nombre}`}
              className="size-9"
              onClick={() => {
                setEditando(c);
                setNombre(c.nombre);
              }}
            >
              <Pencil className="size-3.5" />
            </BotonIcono>
            <BotonIcono etiqueta={`Borrar la colección ${c.nombre}`} className="size-9" onClick={() => setABorrar(c)}>
              <Trash2 className="size-3.5" />
            </BotonIcono>
          </li>
        ))}
      </ul>
      <form onSubmit={crear} className="flex gap-2">
        <EntradaTexto
          aria-label="Nombre de la colección nueva"
          placeholder="Colección nueva"
          maxLength={60}
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
        />
        <BotonIcono
          etiqueta="Crear colección"
          type="submit"
          className="shrink-0 border border-borde"
          disabled={!nueva.trim()}
        >
          <FolderPlus className="size-4" />
        </BotonIcono>
      </form>
      {error && <Aviso tono="error">{error}</Aviso>}

      <Dialogo
        abierto={editando !== null}
        onAbiertoCambio={(a) => !a && setEditando(null)}
        titulo="Renombrar colección"
        pie={
          <>
            <Boton variante="fantasma" onClick={() => setEditando(null)}>
              Cancelar
            </Boton>
            <Boton
              onClick={async () => {
                if (editando && (await ejecutar(renombrarColeccion(editando.id, nombre)))) setEditando(null);
              }}
            >
              Guardar
            </Boton>
          </>
        }
      >
        <EntradaTexto aria-label="Nombre" maxLength={60} value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </Dialogo>

      <Dialogo
        abierto={aBorrar !== null}
        onAbiertoCambio={(a) => !a && setABorrar(null)}
        titulo="¿Borrar la colección?"
        descripcion={`«${aBorrar?.nombre ?? ""}» desaparecerá, pero sus archivos seguirán en tu biblioteca.`}
        pie={
          <>
            <Boton variante="fantasma" onClick={() => setABorrar(null)}>
              Cancelar
            </Boton>
            <Boton
              variante="peligro"
              onClick={async () => {
                if (!aBorrar) return;
                const id = aBorrar.id;
                setABorrar(null);
                if ((await ejecutar(borrarColeccion(id))) && activa === id) onElegir(null);
              }}
            >
              Borrar colección
            </Boton>
          </>
        }
      />
    </nav>
  );
}
