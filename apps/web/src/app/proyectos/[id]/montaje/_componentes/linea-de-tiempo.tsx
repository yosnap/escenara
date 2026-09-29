"use client";

import { Plus } from "lucide-react";
import { Boton } from "@/components/ui/button";
import { Aviso } from "@/components/ui/feedback";
import { ListaOrdenable } from "@/components/ui/lista-ordenable";
import { formatearSegundos } from "@/lib/media/reglas";
import type { EscenaMontableVista } from "@/lib/montaje";
import { type AvisoDuracion, type FragmentoEditable, SEGUNDOS_RAZONABLES_MONTAJE } from "@/lib/montaje-pantalla";
import { TarjetaFragmento } from "./tarjeta-fragmento";

/**
 * La línea de tiempo: los trozos en su orden, con las escenas que están fuera a mano para volver a añadirlas.
 *
 * Se ordena arrastrando y con el teclado, las dos cosas por la misma función (`ListaOrdenable`). Reordenar y
 * recortar **no guardan nada todavía**: el guardado es un botón, porque el montaje se edita a ratos y salvar en
 * cada arrastre convertiría cada tanteo en una versión nueva del montaje.
 */
export function LineaDeTiempo({
  fragmentos,
  escenas,
  duracionTotal,
  aviso,
  deshabilitado,
  onOrden,
  onRecorte,
  onMover,
  onQuitar,
  onAnadir,
}: {
  fragmentos: readonly FragmentoEditable[];
  escenas: readonly EscenaMontableVista[];
  duracionTotal: number;
  aviso: AvisoDuracion | null;
  deshabilitado?: boolean;
  onOrden: (claves: string[]) => void;
  onRecorte: (clave: string, borde: "entrada" | "salida", segundos: number) => void;
  onMover: (indice: number, desplazamiento: -1 | 1) => void;
  onQuitar: (clave: string) => void;
  onAnadir: (escena: EscenaMontableVista) => void;
}) {
  const porId = new Map(escenas.map((e) => [e.escenaId, e]));
  const enLinea = new Set(fragmentos.map((f) => f.escenaId));
  /** Escenas con clip que no están en la línea de tiempo: se pueden volver a meter sin salir de la pantalla. */
  const fuera = escenas.filter((e) => e.duracionClip !== null && !enLinea.has(e.escenaId));

  return (
    <section aria-labelledby="linea-de-tiempo" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="linea-de-tiempo" className="text-2xl font-bold text-texto">
            La línea de tiempo
          </h2>
          <p className="mt-1 text-texto-suave">
            {fragmentos.length} {fragmentos.length === 1 ? "fragmento" : "fragmentos"} ·{" "}
            <strong className="font-mono text-texto">{formatearSegundos(duracionTotal)}</strong> en total
          </p>
        </div>
      </div>

      {aviso && <Aviso tono={aviso.tono}>{aviso.texto}</Aviso>}

      <ListaOrdenable
        etiquetaLista="Fragmentos del montaje, en el orden en el que se verán"
        className="flex flex-col gap-3"
        claseElemento="flex items-start gap-1"
        deshabilitado={deshabilitado}
        // El orden se queda en la pantalla hasta que se guarda, así que nunca hay error que devolver.
        onOrden={async (claves) => {
          onOrden(claves);
          return null;
        }}
        elementos={fragmentos.map((fragmento, indice) => {
          const escena = porId.get(fragmento.escenaId) ?? null;
          return {
            clave: fragmento.clave,
            etiqueta: escena ? `la escena ${escena.orden}` : `el fragmento ${indice + 1}`,
            contenido: (
              <TarjetaFragmento
                fragmento={fragmento}
                escena={escena}
                posicion={indice + 1}
                total={fragmentos.length}
                deshabilitado={deshabilitado}
                onRecorte={(borde, segundos) => onRecorte(fragmento.clave, borde, segundos)}
                onMover={(desplazamiento) => onMover(indice, desplazamiento)}
                onQuitar={() => onQuitar(fragmento.clave)}
              />
            ),
          };
        })}
      />

      {fuera.length > 0 && (
        <div className="flex flex-col gap-2 rounded-tarjeta border-2 border-dashed border-borde/60 p-4">
          <h3 className="font-bold text-texto">Escenas que no están en el montaje</h3>
          <p className="text-sm text-texto-suave">
            Tienen su clip, pero las has quitado de la línea de tiempo. Se añaden al final y sin recortar; después se
            mueven a donde toque.
          </p>
          <div className="flex flex-wrap gap-2">
            {fuera.map((escena) => (
              <Boton
                key={escena.escenaId}
                variante="secundario"
                tamano="sm"
                icono={<Plus className="size-4" aria-hidden />}
                disabled={deshabilitado}
                onClick={() => onAnadir(escena)}
              >
                Escena {escena.orden}
                {escena.duracionClip !== null && (
                  <span className="font-normal text-texto-suave"> ({formatearSegundos(escena.duracionClip)})</span>
                )}
              </Boton>
            ))}
          </div>
        </div>
      )}

      <p className="text-sm text-texto-suave">
        Un reel se ve hasta el final mucho más a menudo por debajo de {SEGUNDOS_RAZONABLES_MONTAJE} s. Recortar aquí no
        toca los clips: siguen enteros en tu biblioteca.
      </p>
    </section>
  );
}
