"use client";

import { UsersRound } from "lucide-react";
import Link from "next/link";
import { claseBoton } from "@/components/ui/button";
import { AnilloHistoria } from "@/components/ui/creator";
import { EstadoVacio } from "@/components/ui/feedback";
import { anilloDeEstado, InsigniaEstadoPersonaje } from "@/components/ui/personaje";
import { ETIQUETA_TIPO_PERSONAJE, type PersonajeVista } from "@/lib/personajes";

/**
 * Lista de personajes con su anillo de estado, el icono y el texto. El estado nunca se indica solo con el
 * color del anillo: cada tarjeta lleva su insignia y, si no se puede generar, lo que le falta.
 */
export function ListaPersonajes({ inicial }: { inicial: PersonajeVista[] }) {
  if (inicial.length === 0) {
    return (
      <EstadoVacio
        nivel={2}
        titulo="Todavía no tienes personajes"
        texto="Un personaje guarda las fotos de referencia de una persona o un animal y el consentimiento para usar su imagen. Es lo que mantiene la misma cara en todos tus vídeos."
        icono={<UsersRound />}
        accion={
          <Link href="/personajes/nuevo" className={claseBoton("chispa")}>
            Crear el primero
          </Link>
        }
      />
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {inicial.map((personaje) => (
        <li key={personaje.id}>
          <Link
            href={`/personajes/${personaje.id}`}
            className="flex h-full gap-4 rounded-tarjeta border-2 border-borde/60 bg-superficie p-4 transition-all duration-(--motion-base) hover:-translate-y-0.5 hover:border-acento hover:shadow-lg"
          >
            <AnilloHistoria
              nombre={personaje.nombre}
              imagen={personaje.portada?.url}
              estado={anilloDeEstado(personaje.estado)}
              tamano={72}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <span className="truncate text-lg font-bold text-texto">{personaje.nombre}</span>
              <span className="text-sm text-texto-suave">
                {ETIQUETA_TIPO_PERSONAJE[personaje.tipo]} · {personaje.totalReferencias}{" "}
                {personaje.totalReferencias === 1 ? "foto" : "fotos"} de {personaje.minimoReferencias} mínimas
              </span>
              <InsigniaEstadoPersonaje estado={personaje.estado} className="self-start" />
              {personaje.impedimentos.length > 0 && (
                <span className="text-sm text-texto-suave">{personaje.impedimentos[0]}</span>
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
