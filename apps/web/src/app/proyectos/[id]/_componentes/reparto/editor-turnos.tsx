"use client";

import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Boton, BotonIcono } from "@/components/ui/button";
import { Aviso } from "@/components/ui/feedback";
import { AreaTexto, Campo, EntradaTexto } from "@/components/ui/field";
import { Selector } from "@/components/ui/select";
import {
  DIRECCION_TURNO_MAXIMA,
  type FormatoReparto,
  type MiembroReparto,
  TEXTO_TURNO_MAXIMO,
  TURNOS_MAXIMOS,
} from "@/lib/reparto";
import { noCabeElDialogo, palabrasDeTurnos, segundosNecesarios } from "@/lib/reparto-envio";
import type { TurnoPedido } from "./api-reparto";

/**
 * **El diálogo repartido por turnos** (0.28.0): en qué orden se habla, quién habla, qué dice **literal** y con qué
 * dirección vocal.
 *
 * Los turnos son una estructura de datos y no un texto libre a propósito: es lo único que permite que el prompt
 * nombre a quién le toca cada frase y que Jev pueda comprobar después si se repartió como se pidió. El texto no se
 * traduce nunca: es lo que se va a oír.
 *
 * Y se avisa **antes de pagar** cuando lo escrito no cabe en la duración del clip, con la misma cuenta que hace el
 * servidor (`lib/reparto-envio.ts`): un clip de 4 s con treinta palabras se corta a media frase y eso se cobra
 * igual. Es un aviso, no un freno: quien quiera generarlo así lo confirma en el botón.
 */
export function EditorTurnos({
  miembros,
  formato,
  turnos,
  segundos,
  deshabilitado,
  guardando,
  onGuardar,
}: {
  miembros: readonly MiembroReparto[];
  formato: FormatoReparto;
  /** Turnos guardados en el servidor. Son el punto de partida del editor. */
  turnos: readonly TurnoPedido[];
  /** Segundos que va a durar cada clip, del plan del proyecto. Es con lo que se juzga si cabe el diálogo. */
  segundos: number;
  deshabilitado: boolean;
  guardando: boolean;
  onGuardar: (turnos: TurnoPedido[]) => void;
}) {
  const [lista, setLista] = useState<TurnoPedido[]>([...turnos]);
  const primero = miembros[0];
  if (!primero) return null;

  const cambiar = (indice: number, cambios: Partial<TurnoPedido>) =>
    setLista((antes) => antes.map((t, i) => (i === indice ? { ...t, ...cambios } : t)));

  const mover = (indice: number, salto: number) =>
    setLista((antes) => {
      const copia = [...antes];
      const [turno] = copia.splice(indice, 1);
      if (!turno) return antes;
      copia.splice(indice + salto, 0, turno);
      return copia;
    });

  const opciones = miembros.map((m) => ({ value: m.personajeId, label: m.nombre }));
  /**
   * Las palabras se cuentan **por clip**, como las cuenta el servidor: en podcast cada clip dice solo los turnos
   * de su personaje, así que sumarlos todos avisaría de que no cabe un diálogo que sí cabe.
   */
  const palabrasDelClipMasLargo =
    formato === "podcast"
      ? Math.max(0, ...miembros.map((m) => palabrasDeTurnos(lista.filter((t) => t.personajeId === m.personajeId))))
      : palabrasDeTurnos(lista);
  const noCabe = noCabeElDialogo(palabrasDelClipMasLargo, segundos);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h5 className="font-semibold text-texto">El diálogo, turno a turno</h5>
        <p className="text-sm text-texto-suave">
          Lo que dice cada uno va tal cual, en castellano y sin traducir: es lo que se va a oír. La dirección vocal («en
          tono cercano») sí se traduce con el resto del texto.
        </p>
      </div>

      {lista.length === 0 && (
        <p className="text-sm text-texto-suave">
          Todavía no has repartido el diálogo. Sin turnos, el modelo decidirá quién dice cada frase.
        </p>
      )}

      <ol className="flex flex-col gap-3">
        {lista.map((turno, indice) => (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: el orden **es** la identidad de un turno sin guardar
            key={`turno-${indice}`}
            className="flex flex-col gap-2 rounded-control bg-elevada p-3"
          >
            <div className="flex flex-wrap items-end justify-between gap-2">
              <span className="text-sm font-semibold text-texto">Turno {indice + 1}</span>
              <div className="flex items-center gap-1">
                <BotonIcono
                  etiqueta={`Subir el turno ${indice + 1}`}
                  disabled={deshabilitado || indice === 0}
                  onClick={() => mover(indice, -1)}
                >
                  <ChevronUp className="size-5" />
                </BotonIcono>
                <BotonIcono
                  etiqueta={`Bajar el turno ${indice + 1}`}
                  disabled={deshabilitado || indice === lista.length - 1}
                  onClick={() => mover(indice, 1)}
                >
                  <ChevronDown className="size-5" />
                </BotonIcono>
                <BotonIcono
                  etiqueta={`Quitar el turno ${indice + 1}`}
                  disabled={deshabilitado}
                  onClick={() => setLista((antes) => antes.filter((_, i) => i !== indice))}
                >
                  <Trash2 className="size-5" />
                </BotonIcono>
              </div>
            </div>
            <Selector
              etiqueta="Quién lo dice"
              opciones={opciones}
              valor={turno.personajeId}
              deshabilitado={deshabilitado}
              onCambio={(v) => cambiar(indice, { personajeId: v ?? primero.personajeId })}
            />
            <Campo etiqueta="Lo que dice, literal">
              {(p) => (
                <AreaTexto
                  {...p}
                  value={turno.texto}
                  maxLength={TEXTO_TURNO_MAXIMO}
                  disabled={deshabilitado}
                  onChange={(e) => cambiar(indice, { texto: e.target.value })}
                />
              )}
            </Campo>
            <Campo etiqueta="Dirección vocal" ayuda="Cómo lo dice: «en tono cercano», «con energía». Puede ir vacía.">
              {(p) => (
                <EntradaTexto
                  {...p}
                  value={turno.direccion}
                  maxLength={DIRECCION_TURNO_MAXIMA}
                  disabled={deshabilitado}
                  onChange={(e) => cambiar(indice, { direccion: e.target.value })}
                />
              )}
            </Campo>
          </li>
        ))}
      </ol>

      {noCabe && (
        <Aviso tono="info">
          El clip más largo dice {palabrasDelClipMasLargo} palabras y harían falta unos{" "}
          {segundosNecesarios(palabrasDelClipMasLargo)} s, pero el clip es de {segundos} s: se va a cortar a media
          frase. Acorta los turnos o alarga el clip del proyecto. Si quieres generarlo así, lo confirmarás antes de
          pagar.
        </Aviso>
      )}

      <div className="flex flex-wrap gap-2">
        <Boton
          variante="secundario"
          tamano="sm"
          disabled={deshabilitado || lista.length >= TURNOS_MAXIMOS}
          onClick={() =>
            setLista((antes) => [
              ...antes,
              {
                // Se alterna quien habla: en una conversación el turno siguiente es casi siempre del otro.
                personajeId:
                  miembros.find((m) => m.personajeId !== antes.at(-1)?.personajeId)?.personajeId ?? primero.personajeId,
                texto: "",
                direccion: "",
              },
            ])
          }
        >
          <Plus className="size-4" />
          Añadir un turno
        </Boton>
        <Boton variante="secundario" tamano="sm" disabled={deshabilitado || guardando} onClick={() => onGuardar(lista)}>
          {guardando ? "Guardando…" : "Guardar el diálogo"}
        </Boton>
      </div>
      <p className="text-sm text-texto-suave">
        Como mucho {TURNOS_MAXIMOS} turnos por escena: un intercambio más largo no cabe en un clip.
      </p>
    </div>
  );
}
