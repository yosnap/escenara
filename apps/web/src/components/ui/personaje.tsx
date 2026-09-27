"use client";

import { CheckCircle2, Clock3, ShieldOff, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import {
  DESCRIPCION_ESTADO_PERSONAJE,
  type EstadoPersonaje,
  ETIQUETA_ESTADO_PERSONAJE,
  ETIQUETA_TIPO_PERSONAJE,
  type PersonajeElegible,
} from "@/lib/personajes";
import { cn } from "./cn";
import { AnilloHistoria, type EstadoPersonaje as EstadoAnillo } from "./creator";

/**
 * Piezas compartidas de personaje: el anillo con su estado, la insignia de estado y el selector de «Crear».
 *
 * El estado nunca se indica solo con color: siempre lleva icono y texto, como el resto de los estados de
 * Escenara.
 */

/**
 * Traduce el estado real del personaje al del anillo de historia del catálogo de componentes. Un `borrador`
 * se pinta como «faltan fotos» porque es lo que le falta casi siempre; el detalle exacto lo da la lista de
 * impedimentos de la ficha, no el anillo.
 */
const ANILLO: Record<EstadoPersonaje, EstadoAnillo> = {
  listo: "listo",
  borrador: "faltan-fotos",
  en_revision: "en-revision",
  bloqueado: "bloqueado",
};

export const anilloDeEstado = (estado: EstadoPersonaje): EstadoAnillo => ANILLO[estado];

const INSIGNIA: Record<EstadoPersonaje, { clase: string; icono: ReactNode }> = {
  listo: { clase: "border-correcto/45 text-correcto", icono: <CheckCircle2 className="size-4" /> },
  borrador: { clase: "border-aviso/45 text-aviso", icono: <TriangleAlert className="size-4" /> },
  en_revision: { clase: "border-acento/45 text-acento", icono: <Clock3 className="size-4" /> },
  bloqueado: { clase: "border-error/45 text-error", icono: <ShieldOff className="size-4" /> },
};

/** Insignia de estado del personaje: borde completo, icono y texto. */
export function InsigniaEstadoPersonaje({ estado, className }: { estado: EstadoPersonaje; className?: string }) {
  const i = INSIGNIA[estado];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border-2 bg-superficie px-3 py-1 text-sm font-semibold",
        i.clase,
        className,
      )}
      title={DESCRIPCION_ESTADO_PERSONAJE[estado]}
    >
      <span aria-hidden>{i.icono}</span>
      {ETIQUETA_ESTADO_PERSONAJE[estado]}
    </span>
  );
}

/**
 * Selector de personaje de «Crear». No es un `<select>` nativo: son botones grandes con el anillo, el estado
 * y cuántas fotos tiene cada uno, más una opción para no usar ninguno (la imagen suelta de 0.10.0 sigue
 * disponible). Los que no pueden generar se muestran deshabilitados con el motivo delante.
 */
export function SelectorPersonaje({
  personajes,
  valor,
  onCambio,
  deshabilitado,
}: {
  personajes: PersonajeElegible[];
  /** Identificador del personaje elegido, o `null` para usar una imagen suelta. */
  valor: string | null;
  onCambio: (id: string | null) => void;
  deshabilitado?: boolean;
}) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-sm font-semibold text-texto">Personaje</legend>
      <ul className="grid gap-3 sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]">
        <li>
          <BotonPersonaje
            elegido={valor === null}
            deshabilitado={deshabilitado}
            onClick={() => onCambio(null)}
            titulo="Sin personaje"
            detalle="Usar una imagen suelta"
          />
        </li>
        {personajes.map((p) => (
          <li key={p.id}>
            <BotonPersonaje
              elegido={valor === p.id}
              deshabilitado={deshabilitado || p.estado !== "listo"}
              onClick={() => onCambio(p.id)}
              titulo={p.nombre}
              detalle={`${ETIQUETA_TIPO_PERSONAJE[p.tipo]} · ${p.totalReferencias} ${p.totalReferencias === 1 ? "foto" : "fotos"}`}
              anillo={
                <AnilloHistoria
                  nombre={p.nombre}
                  imagen={p.portada?.url}
                  estado={anilloDeEstado(p.estado)}
                  tamano={64}
                />
              }
              estado={p.estado}
            />
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

function BotonPersonaje({
  elegido,
  deshabilitado,
  onClick,
  titulo,
  detalle,
  anillo,
  estado,
}: {
  elegido: boolean;
  deshabilitado?: boolean;
  onClick: () => void;
  titulo: string;
  detalle: string;
  anillo?: ReactNode;
  estado?: EstadoPersonaje;
}) {
  return (
    <button
      type="button"
      aria-pressed={elegido}
      disabled={deshabilitado}
      onClick={onClick}
      className={cn(
        "flex w-full flex-col items-center gap-2 rounded-tarjeta border-2 bg-superficie p-3 text-center transition-all duration-(--motion-base) hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none",
        elegido ? "border-acento shadow-md" : "border-borde/60",
      )}
    >
      {anillo}
      <span className="font-semibold text-texto">{titulo}</span>
      <span className="text-sm text-texto-suave">{detalle}</span>
      {estado && estado !== "listo" && <InsigniaEstadoPersonaje estado={estado} />}
    </button>
  );
}
