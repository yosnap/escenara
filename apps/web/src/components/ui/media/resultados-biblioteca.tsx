"use client";

import { ChevronLeft, ChevronRight, ImagePlus, Trash2 } from "lucide-react";
import { use } from "react";
import type { FiltroMedios, Medio } from "@/lib/media/tipos";
import { Boton } from "../button";
import { cn } from "../cn";
import { AvisoEstado, EstadoVacio } from "../feedback";
import { paginaMedios } from "./api-medios";
import { type AccionesMedio, ElementoMedio, type VistaBiblioteca } from "./elemento-medio";

export interface Consulta {
  filtro: FiltroMedios;
  version: number;
}

/** Página de resultados. Suspende mientras llega la primera respuesta de cada consulta. */
export function ResultadosBiblioteca({
  consulta,
  vista,
  seleccion,
  onAlternar,
  acciones,
  onPagina,
  onReintentar,
}: {
  consulta: Consulta;
  vista: VistaBiblioteca;
  seleccion: ReadonlySet<string>;
  onAlternar?: (medio: Medio) => void;
  acciones: AccionesMedio;
  onPagina: (pagina: number) => void;
  onReintentar: () => void;
}) {
  const resultado = use(paginaMedios(consulta.filtro, consulta.version));

  if (!resultado.ok) {
    return (
      <AvisoEstado
        estado="bloqueado"
        motivo={resultado.error}
        accion={
          <Boton variante="secundario" tamano="sm" onClick={onReintentar}>
            Reintentar
          </Boton>
        }
      />
    );
  }

  const { elementos, total, pagina, porPagina } = resultado.datos;
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const { papelera, busqueda } = consulta.filtro;

  if (elementos.length === 0) {
    return (
      <EstadoVacio
        icono={papelera ? <Trash2 /> : <ImagePlus />}
        titulo={papelera ? "La papelera está vacía" : busqueda ? "Sin resultados" : "Aún no hay medios"}
        texto={
          papelera
            ? "Los medios que envíes a la papelera aparecerán aquí y podrás restaurarlos."
            : busqueda
              ? "Prueba con otras palabras o quita el filtro de tipo."
              : "Sube fotos, vídeos o audios, o arrástralos aquí."
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ul
        className={cn(
          vista === "cuadricula" ? "grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3" : "flex flex-col gap-2",
        )}
      >
        {elementos.map((m) => (
          <ElementoMedio
            key={m.id}
            medio={m}
            vista={vista}
            seleccionado={seleccion.has(m.id)}
            onAlternar={onAlternar}
            acciones={acciones}
          />
        ))}
      </ul>
      <nav aria-label="Paginación" className="flex items-center justify-between gap-3">
        <span className="text-sm text-texto-suave">
          {total} {total === 1 ? "medio" : "medios"} · página {pagina} de {paginas}
        </span>
        <div className="flex gap-2">
          <Boton
            variante="secundario"
            tamano="sm"
            icono={<ChevronLeft className="size-4" />}
            disabled={pagina <= 1}
            onClick={() => onPagina(pagina - 1)}
          >
            Anterior
          </Boton>
          <Boton variante="secundario" tamano="sm" disabled={pagina >= paginas} onClick={() => onPagina(pagina + 1)}>
            Siguiente <ChevronRight className="size-4" />
          </Boton>
        </div>
      </nav>
    </div>
  );
}
