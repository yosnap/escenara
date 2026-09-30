"use client";

import { MapPin } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Interruptor } from "@/components/ui/choice";
import { Aviso } from "@/components/ui/feedback";
import { Campo, EntradaTexto } from "@/components/ui/field";
import { Selector } from "@/components/ui/select";
import {
  type LugarDeEscena,
  type LugarResumen,
  queFaltaAlLugar,
  SITIO_EN_LUGAR_MAXIMO,
  SUGERENCIA_FAMOSO,
} from "@/lib/lugares";
import { listarLugares } from "./api-lugares";

/**
 * **El lugar**, en «Crear» y en la escena de un proyecto: elegir uno de tus lugares y, si quieres, dónde dentro de él.
 * Lo que se ve es su nombre y lo que has escrito, en castellano; el texto que se envía lo compone el servidor.
 *
 * Solo se ofrecen los lugares del mismo acabado (reales en un proyecto realista, animados del mismo estilo en uno
 * animado). El servidor lo vuelve a comprobar: filtrar aquí es comodidad, no la puerta.
 */

/** Los lugares del usuario, pedidos una vez por página: varias escenas los comparten. */
let enCurso: Promise<LugarResumen[] | null> | null = null;
function lugaresCompartidos(): Promise<LugarResumen[] | null> {
  enCurso ??= listarLugares().then((r) => (r.ok ? r.datos : null));
  return enCurso;
}

/** Vuelve a pedirlos la próxima vez (al crear uno nuevo en otra pestaña, por ejemplo). */
export const olvidarLugares = () => {
  enCurso = null;
};

/** `activo = false` cuando la lista ya viene dada (el catálogo de componentes): entonces no se pide nada. */
export function useLugares(activo = true): { lugares: LugarResumen[] | null; error: boolean } {
  const [lugares, setLugares] = useState<LugarResumen[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    void lugaresCompartidos().then((lista) => {
      if (!vivo) return;
      if (lista) setLugares(lista);
      else setError(true);
    });
    return () => {
      vivo = false;
    };
  }, [activo]);
  return { lugares, error };
}

const SIN_LUGAR = "__sin_lugar";
const HEREDAR = "__heredar";

export interface SelectorLugarProps {
  valor: LugarDeEscena;
  onCambio: (valor: LugarDeEscena) => void;
  /** Acabado con el que tiene que casar: los demás no se ofrecen. `null` = cualquiera. */
  acabado: { acabado: "realista" | "animado"; estilo: string } | null;
  /** Lugar del proyecto que se hereda (`null` = no tiene). `undefined` = no hay proyecto: en «Crear» no se hereda. */
  heredadoId?: string | null;
  /** Ofrecer el plano del lugar solo (solo en la escena de un proyecto). */
  conPlanoSolo?: boolean;
  deshabilitado?: boolean;
  /** Lista ya cargada, para el catálogo de componentes; sin ella se pide al servidor. */
  lugares?: LugarResumen[];
}

export function SelectorLugar({
  valor,
  onCambio,
  acabado,
  heredadoId,
  conPlanoSolo = false,
  deshabilitado,
  lugares: dados,
}: SelectorLugarProps) {
  const pedidos = useLugares(!dados);
  const lugares = dados ?? pedidos.lugares;
  const casan = (lugar: LugarResumen) =>
    !acabado ||
    (lugar.acabado === acabado.acabado &&
      (acabado.acabado === "realista" || acabado.estilo === "" || lugar.estilo === acabado.estilo));
  const disponibles = (lugares ?? []).filter(casan);
  const conHerencia = heredadoId !== undefined;
  const heredado = heredadoId ? ((lugares ?? []).find((l) => l.id === heredadoId) ?? null) : null;
  const efectivo = valor.heredar ? heredado : disponibles.find((l) => l.id === valor.lugarId);
  const faltas = efectivo ? queFaltaAlLugar(efectivo) : [];
  const elegido = valor.heredar ? HEREDAR : valor.lugarId === "" ? SIN_LUGAR : valor.lugarId;

  const opciones = [
    ...(conHerencia
      ? [
          {
            value: HEREDAR,
            label: heredado ? `El del proyecto: ${heredado.nombre}` : "El del proyecto (no tiene ninguno)",
          },
        ]
      : []),
    { value: SIN_LUGAR, label: "Sin lugar", descripcion: "El sitio sale de la descripción de la escena." },
    ...disponibles.map((l) => ({
      value: l.id,
      label: l.nombre,
      descripcion: queFaltaAlLugar(l).length > 0 ? `Falta: ${queFaltaAlLugar(l).join(" ")}` : l.descripcion,
    })),
  ];

  return (
    <section className="flex flex-col gap-3 rounded-tarjeta bg-elevada p-4">
      <h3 className="flex items-center gap-2 font-bold text-texto">
        <MapPin className="size-5 text-acento" aria-hidden /> El lugar
      </h3>
      <Selector
        etiqueta="Dónde ocurre"
        valor={elegido}
        deshabilitado={deshabilitado || lugares === null}
        marcador={lugares === null ? "Cargando tus lugares…" : "Elige un lugar"}
        opciones={opciones}
        onCambio={(v) => {
          if (!v) return;
          if (v === HEREDAR) onCambio({ ...valor, heredar: true, lugarId: "" });
          else if (v === SIN_LUGAR) onCambio({ heredar: false, lugarId: "", sitio: "", plano: "con_reparto" });
          else onCambio({ ...valor, heredar: false, lugarId: v });
        }}
      />
      {pedidos.error && !dados && <Aviso tono="error">No se han podido cargar tus lugares. Recarga la página.</Aviso>}
      {efectivo && (
        <>
          <Campo
            etiqueta="Dónde, dentro del lugar (opcional)"
            ayuda="«Junto a la ventana», «detrás de la barra». Sustituye a la localización de la dirección."
          >
            {(props) => (
              <EntradaTexto
                {...props}
                value={valor.sitio}
                maxLength={SITIO_EN_LUGAR_MAXIMO}
                disabled={deshabilitado}
                onChange={(e) => onCambio({ ...valor, sitio: e.target.value })}
              />
            )}
          </Campo>
          {conPlanoSolo && (
            <Interruptor
              etiqueta="Plano del lugar solo"
              descripcion="El sitio sin nadie, mudo: sin reparto ni producto. Sirve de plano de situación o de recurso."
              activo={valor.plano === "solo_lugar"}
              deshabilitado={deshabilitado}
              onCambio={(activo) => onCambio({ ...valor, plano: activo ? "solo_lugar" : "con_reparto" })}
            />
          )}
          {faltas.length > 0 && (
            <Aviso tono="aviso">
              A «{efectivo.nombre}» le falta algo para poder generar: {faltas.join(" ")}{" "}
              <Link href={`/lugares/${efectivo.id}`} className="font-semibold underline">
                Abrir el lugar
              </Link>
            </Aviso>
          )}
        </>
      )}
      <p className="text-sm text-texto-suave">
        {SUGERENCIA_FAMOSO}{" "}
        <Link href="/lugares" className="font-semibold text-acento underline">
          Tus lugares
        </Link>
      </p>
    </section>
  );
}
