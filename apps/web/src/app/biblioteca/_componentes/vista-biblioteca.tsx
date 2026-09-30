"use client";

import { CheckSquare, FolderMinus, FolderPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { Aviso } from "@/components/ui/feedback";
import { anadirAColeccion, quitarDeColeccion } from "@/components/ui/media/api-medios";
import { BarraEspacio } from "@/components/ui/media/barra-espacio";
import { BibliotecaMedios } from "@/components/ui/media/biblioteca-medios";
import { Selector } from "@/components/ui/select";
import type { Coleccion, EspacioUsado, Medio } from "@/lib/media/tipos";
import { ListaColecciones } from "./lista-colecciones";

export function VistaBiblioteca({ colecciones, espacio }: { colecciones: Coleccion[]; espacio: EspacioUsado }) {
  const router = useRouter();
  const [activa, setActiva] = useState<string | null>(null);
  const [seleccionando, setSeleccionando] = useState(false);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [destino, setDestino] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tono: "ok" | "error"; texto: string } | null>(null);
  // Cambia para volver a montar la biblioteca cuando cambia el contenido de la colección activa.
  const [version, setVersion] = useState(0);

  const coleccionActiva = colecciones.find((c) => c.id === activa) ?? null;
  const ids = [...seleccion];

  const terminarSeleccion = () => {
    setSeleccionando(false);
    setSeleccion(new Set());
  };

  const alternar = (medio: Medio) =>
    setSeleccion((actual) => {
      const nueva = new Set(actual);
      if (nueva.has(medio.id)) nueva.delete(medio.id);
      else nueva.add(medio.id);
      return nueva;
    });

  const aplicar = async (accion: Promise<{ ok: boolean; error?: string }>, exito: string) => {
    const r = await accion;
    if (!r.ok) return setAviso({ tono: "error", texto: r.error ?? "No se ha podido completar la operación." });
    setAviso({ tono: "ok", texto: exito });
    terminarSeleccion();
    setVersion((v) => v + 1);
    router.refresh();
  };

  return (
    <div className="grid gap-6 md:grid-cols-[16rem_1fr]">
      <aside className="flex flex-col gap-5">
        <BarraEspacio espacio={espacio} />
        <ListaColecciones
          colecciones={colecciones}
          activa={activa}
          onElegir={(id) => {
            setActiva(id);
            terminarSeleccion();
            setAviso(null);
          }}
          onCambio={() => router.refresh()}
        />
      </aside>

      <section aria-label={coleccionActiva?.nombre ?? "Todos tus archivos"} className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-bold text-texto">{coleccionActiva?.nombre ?? "Todos tus archivos"}</h2>
          {!seleccionando ? (
            <Boton
              variante="secundario"
              icono={<CheckSquare className="size-4" />}
              onClick={() => setSeleccionando(true)}
            >
              Seleccionar
            </Boton>
          ) : (
            <div className="flex flex-wrap items-center gap-2 rounded-tarjeta border border-borde bg-superficie p-2">
              <span className="px-2 text-sm font-semibold text-texto" aria-live="polite">
                {seleccion.size} {seleccion.size === 1 ? "seleccionado" : "seleccionados"}
              </span>
              {colecciones.length > 0 && (
                <div className="w-52">
                  <Selector
                    etiqueta="Añadir a la colección"
                    marcador="Elige una colección"
                    opciones={colecciones.map((c) => ({ value: c.id, label: c.nombre }))}
                    valor={destino}
                    onCambio={setDestino}
                  />
                </div>
              )}
              <Boton
                tamano="sm"
                icono={<FolderPlus className="size-4" />}
                disabled={!destino || ids.length === 0}
                onClick={() => destino && aplicar(anadirAColeccion(destino, ids), "Añadidos a la colección.")}
              >
                Añadir
              </Boton>
              {coleccionActiva && (
                <Boton
                  tamano="sm"
                  variante="secundario"
                  icono={<FolderMinus className="size-4" />}
                  disabled={ids.length === 0}
                  onClick={() => aplicar(quitarDeColeccion(coleccionActiva.id, ids), "Quitados de la colección.")}
                >
                  Quitar de esta colección
                </Boton>
              )}
              <Boton tamano="sm" variante="fantasma" icono={<X className="size-4" />} onClick={terminarSeleccion}>
                Cancelar
              </Boton>
            </div>
          )}
        </div>
        {aviso && <Aviso tono={aviso.tono === "error" ? "error" : "correcto"}>{aviso.texto}</Aviso>}
        <BibliotecaMedios
          key={`${activa ?? "todas"}-${version}`}
          coleccion={activa}
          seleccion={seleccion}
          onAlternar={seleccionando ? alternar : undefined}
          onCambio={() => router.refresh()}
        />
      </section>
    </div>
  );
}
