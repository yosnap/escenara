"use client";

import { Casilla } from "@/components/ui/choice";
import { Campo, EntradaTexto } from "@/components/ui/field";
import { AYUDA_CATEGORIA } from "@/lib/presets";
import {
  AYUDA_DIRECCION_DECIDIDA,
  AYUDA_DURACIONES_ADMITIDAS,
  CATEGORIAS_DECIDIBLES,
  type CategoriaDecidible,
  etiquetaDecidible,
} from "@/lib/trends";

/**
 * Los dos campos de un trend que dicen **qué decide él** (0.34.0): qué duraciones admite y qué parte de la dirección del
 * clip dicta su texto. Viven aparte del diálogo de la plantilla para que ese fichero siga leyéndose de una vez.
 */

/**
 * Lee lo escrito en «Duraciones admitidas»: segundos separados por comas. Devuelve la lista de números o el error con la
 * causa; el servidor vuelve a validarlos (enteros entre 1 y 600).
 */
export function leerDuracionesEscritas(texto: string): { duraciones: number[] } | { error: string } {
  const partes = texto
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p !== "");
  const duraciones: number[] = [];
  for (const parte of partes) {
    if (!/^\d+$/.test(parte))
      return { error: `«${parte}» no es un número de segundos: escribe enteros separados por comas, como «5, 8».` };
    duraciones.push(Number(parte));
  }
  return { duraciones };
}

export function CampoDuracionesAdmitidas({
  valor,
  disenada,
  onCambio,
}: {
  /** Lo escrito, tal cual: se lee al guardar. */
  valor: string;
  /** Duración con la que se diseñó el trend (dato histórico), si la tiene. */
  disenada: number | null;
  onCambio: (texto: string) => void;
}) {
  return (
    <Campo
      etiqueta="Duraciones admitidas (s)"
      ayuda={
        disenada === null
          ? AYUDA_DURACIONES_ADMITIDAS
          : `${AYUDA_DURACIONES_ADMITIDAS} Se diseñó para ${disenada} s: es solo un dato histórico y ya no limita nada.`
      }
    >
      {(props) => (
        <EntradaTexto
          {...props}
          inputMode="numeric"
          value={valor}
          onChange={(e) => onCambio(e.target.value)}
          placeholder="Vacío = cualquier duración"
        />
      )}
    </Campo>
  );
}

/**
 * «La dirección decide»: una casilla por categoría que un trend puede dictar. Casillas y no un desplegable múltiple,
 * porque se leen todas de un vistazo y cada una lleva su explicación.
 */
export function CampoDireccionDecidida({
  valor,
  onCambio,
}: {
  valor: readonly CategoriaDecidible[];
  onCambio: (categorias: CategoriaDecidible[]) => void;
}) {
  const alternar = (categoria: CategoriaDecidible, marcada: boolean) =>
    onCambio(CATEGORIAS_DECIDIBLES.filter((c) => (c === categoria ? marcada : valor.includes(c))));
  return (
    <fieldset className="flex flex-col gap-2 rounded-tarjeta border-2 border-borde bg-superficie p-4">
      <legend className="px-1 font-semibold text-texto">La dirección decide</legend>
      <p className="text-sm text-texto-suave">{AYUDA_DIRECCION_DECIDIDA}</p>
      {CATEGORIAS_DECIDIBLES.map((categoria) => (
        <Casilla
          key={categoria}
          etiqueta={etiquetaDecidible(categoria)}
          descripcion={AYUDA_CATEGORIA[categoria]}
          marcada={valor.includes(categoria)}
          onCambio={(marcada) => alternar(categoria, marcada)}
        />
      ))}
    </fieldset>
  );
}
