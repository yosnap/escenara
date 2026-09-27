"use client";

import { ArrowLeft, ArrowRight, Trash2 } from "lucide-react";
import { useState } from "react";
import { Boton, BotonIcono } from "@/components/ui/button";
import { MiniaturaMedio } from "@/components/ui/media/miniatura-medio";
import { SelectorMedios } from "@/components/ui/media/selector-medios";
import { DistintivoOrigen } from "@/components/ui/personajes/distintivo-origen";
import { ACCION_MOTIVO, ETIQUETA_MOTIVO, ETIQUETA_VISTA } from "@/lib/captura-personaje";
import type { Medio } from "@/lib/media/tipos";
import { MAXIMO_REFERENCIAS, type PersonajeVista } from "@/lib/personajes";

/**
 * Fotos de referencia del personaje: añadir desde la biblioteca o subiendo, quitar y reordenar. La primera es
 * la portada y la que más peso tiene en la identidad, así que el orden se puede cambiar.
 *
 * Quitar una referencia **no borra la foto de la biblioteca**: se deshace la relación y se dice expresamente.
 */
export function PanelReferencias({
  personaje,
  onCambio,
  ocupado,
}: {
  personaje: PersonajeVista;
  /** Devuelve el error, o `null` si ha ido bien. */
  onCambio: (accion: "anadir" | "quitar" | "ordenar", ids: string[]) => Promise<string | null>;
  ocupado: boolean;
}) {
  const [nuevas, setNuevas] = useState<Medio[]>([]);
  const referencias = personaje.referencias ?? [];
  const hueco = MAXIMO_REFERENCIAS - referencias.length;
  // La portada la elige el servidor: es la **primera foto original**, no la primera referencia. Si la primera
  // fuera una vista generada, marcar la posición 0 diría que la portada es algo que no lo es.
  const portada = referencias.find((r) => r.origen === "foto_original")?.id ?? null;

  const mover = (indice: number, salto: number) => {
    const orden = referencias.map((r) => r.id);
    const destino = indice + salto;
    if (destino < 0 || destino >= orden.length) return;
    const actual = orden[indice] as string;
    orden[indice] = orden[destino] as string;
    orden[destino] = actual;
    void onCambio("ordenar", orden);
  };

  return (
    <section aria-label="Fotos de referencia" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-2xl font-bold text-texto">Fotos de referencia</h2>
        <p className="text-sm text-texto-suave">
          {referencias.length} de {MAXIMO_REFERENCIAS} · {personaje.totalReferencias} original
          {personaje.totalReferencias === 1 ? "" : "es"} de {personaje.minimoReferencias} para poder generar
        </p>
      </div>

      {referencias.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-[repeat(auto-fill,minmax(9rem,1fr))]">
          {referencias.map((referencia, indice) => (
            <li
              key={referencia.id}
              className="flex flex-col gap-2 rounded-tarjeta border border-borde bg-superficie p-2"
            >
              <div className="relative aspect-square overflow-hidden rounded-control bg-elevada">
                <MiniaturaMedio medio={referencia.medio} className="object-cover" />
                {referencia.id === portada && (
                  <span className="absolute top-1.5 left-1.5 rounded-full bg-acento px-2 py-0.5 text-xs font-bold text-sobre-acento">
                    Portada
                  </span>
                )}
                {/* Una vista generada lleva su distintivo **sobre la propia imagen**: nunca se presenta como
                    una foto del personaje, ni de refilón. */}
                {referencia.origen === "vista_generada" && (
                  <DistintivoOrigen
                    origen={referencia.origen}
                    sobreImagen
                    className="absolute inset-x-1.5 bottom-1.5 justify-center"
                  />
                )}
              </div>
              <p className="text-xs text-texto-suave">
                {referencia.vistaClave && `${ETIQUETA_VISTA[referencia.vistaClave]}`}
                {!referencia.vistaClave && referencia.vista}
              </p>
              {referencia.origen === "vista_generada" && (
                <p className="text-xs text-texto-suave">No cuenta como foto original del personaje.</p>
              )}
              {referencia.motivosMarcada.map((motivo) => (
                <p key={motivo} className="text-xs font-medium text-aviso">
                  {ETIQUETA_MOTIVO[motivo]}: {ACCION_MOTIVO[motivo]}
                </p>
              ))}
              <div className="flex items-center justify-between">
                <span className="flex">
                  <BotonIcono
                    etiqueta={`Mover ${referencia.medio.nombre} antes`}
                    disabled={ocupado || indice === 0}
                    className="size-9"
                    onClick={() => mover(indice, -1)}
                  >
                    <ArrowLeft className="size-4" />
                  </BotonIcono>
                  <BotonIcono
                    etiqueta={`Mover ${referencia.medio.nombre} después`}
                    disabled={ocupado || indice === referencias.length - 1}
                    className="size-9"
                    onClick={() => mover(indice, 1)}
                  >
                    <ArrowRight className="size-4" />
                  </BotonIcono>
                </span>
                <BotonIcono
                  etiqueta={`Quitar ${referencia.medio.nombre} del personaje`}
                  disabled={ocupado}
                  className="size-9 text-error"
                  onClick={() => void onCambio("quitar", [referencia.id])}
                >
                  <Trash2 className="size-4" />
                </BotonIcono>
              </div>
            </li>
          ))}
        </ul>
      )}

      {hueco > 0 && (
        <div className="flex flex-col gap-3">
          <SelectorMedios
            etiqueta="Añadir más fotos"
            ayuda="Solo imágenes. Las que quites de aquí siguen en tu biblioteca: lo que se deshace es la relación con el personaje."
            tipos={["imagen"]}
            multiple
            sinDocumentos
            valor={nuevas}
            onCambio={setNuevas}
          />
          {nuevas.length > 0 && (
            <Boton
              className="self-start"
              cargando={ocupado}
              onClick={async () => {
                const error = await onCambio(
                  "anadir",
                  nuevas.slice(0, hueco).map((m) => m.id),
                );
                if (!error) setNuevas([]);
              }}
            >
              Añadir {nuevas.length === 1 ? "la foto" : `las ${nuevas.length} fotos`}
            </Boton>
          )}
        </div>
      )}
    </section>
  );
}
