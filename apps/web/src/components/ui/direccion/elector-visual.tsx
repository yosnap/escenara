"use client";

import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { ChevronDown, type LucideIcon, Sparkles } from "lucide-react";
import { type ReactNode, useId } from "react";
import { seccionesMontadas } from "@/lib/acciones-producto-pantalla";
import { cn } from "../cn";
import { ExplicacionGrupo, TituloGrupo, type TonoGrupo } from "./cabecera-grupo";

/**
 * **Elector visual** (0.25.1): una rejilla de tarjetas con pictograma, nombre y **una** frase llana de lo que verá
 * el espectador. Es lo que sustituye al desplegable donde la palabra sola no basta —plano, ángulo, movimiento de
 * cámara y momento del gesto—, porque «contrapicado» no dice nada si no has rodado nunca.
 *
 * Reglas de la casa que cumple:
 *
 * - **no es un `<select>` nativo** ni lo envuelve: es un grupo de radios con teclado y lector de pantalla;
 * - **sin bordes laterales de color**: la opción elegida se marca con el borde entero y un anillo, nunca con una
 *   franja a un lado;
 * - **cada tarjeta dice una sola cosa** (0.33.2): la descripción del catálogo, que es la que escribe y corrige
 *   quien administra; si la opción no tiene, la frase del pictograma. Pintar las dos era contar lo mismo con dos
 *   redacciones distintas;
 * - **una lista puede tener partes** (0.33.2): `secciones` añade subtítulos y `plegable` un bloque que se abre y
 *   se cierra, y todas las tarjetas siguen siendo **un único grupo de radios**, con una sola opción elegida.
 */

export interface OpcionVisual {
  valor: string;
  nombre: string;
  /** Frase llana de una línea, la del pictograma. Solo se pinta si la opción no trae `descripcion`. */
  frase: string;
  /** Descripción del catálogo, la que escribió quien administra. Es la que se pinta cuando existe. */
  descripcion?: string;
  pictograma: ReactNode;
  /** Aviso corto que se enseña en la tarjeta: en la cámara, el nivel de riesgo. */
  etiqueta?: string;
}

/** Un trozo de la lista con su subtítulo: «Moda», «Cuidado de la piel»… */
export interface SeccionVisual {
  clave: string;
  titulo: string;
  opciones: OpcionVisual[];
}

/** Un bloque de secciones que empieza cerrado. Lo abre y lo cierra quien lo usa, que sabe cuándo abrirlo solo. */
export interface PlegableVisual {
  titulo: string;
  abierto: boolean;
  /** `true` si no se puede cerrar (la opción elegida está dentro): el botón se apaga y lo dice. */
  bloqueado?: boolean;
  onCambioAbierto: (abierto: boolean) => void;
  secciones: SeccionVisual[];
}

/** La única línea de texto de una tarjeta: la del catálogo si existe y, si no, la del pictograma. */
export const textoDeTarjeta = (o: Pick<OpcionVisual, "frase" | "descripcion">): string =>
  o.descripcion?.trim() || o.frase.trim();

export function ElectorVisual({
  etiqueta,
  ayuda,
  icono = Sparkles,
  tono = "direccion",
  resumen,
  opciones,
  tituloOpciones,
  secciones = [],
  plegable,
  valor,
  deshabilitado,
  onCambio,
  className,
}: {
  etiqueta: string;
  ayuda?: string;
  icono?: LucideIcon;
  tono?: TonoGrupo;
  /** Lo elegido, dicho en una línea visible («Elegida: Abrirlo»). Se anuncia a los lectores al cambiar. */
  resumen?: string;
  opciones: OpcionVisual[];
  /** Subtítulo de la primera parte de la lista, cuando hay más partes. */
  tituloOpciones?: string;
  secciones?: SeccionVisual[];
  plegable?: PlegableVisual;
  /** La opción elegida. Cadena vacía = ninguna, que en cada campo significa una cosa distinta. */
  valor: string;
  deshabilitado?: boolean;
  onCambio: (valor: string) => void;
  className?: string;
}) {
  const idAyuda = useId();
  const idPlegable = useId();
  const partes: SeccionVisual[] = [{ clave: "__primera", titulo: tituloOpciones ?? "", opciones }, ...secciones];
  return (
    <fieldset className={cn("flex min-w-0 flex-col gap-4", className)} disabled={deshabilitado}>
      <legend className="mb-3 w-full">
        <TituloGrupo icono={icono} titulo={etiqueta} tono={tono} />
      </legend>
      {ayuda && (
        <ExplicacionGrupo tono={tono} id={idAyuda}>
          {ayuda}
        </ExplicacionGrupo>
      )}
      {resumen && (
        <p aria-live="polite" className="w-fit rounded-full bg-elevada px-3 py-1 text-sm font-semibold text-texto">
          {resumen}
        </p>
      )}
      <RadioGroup
        value={valor}
        onValueChange={(v) => onCambio(String(v ?? ""))}
        disabled={deshabilitado}
        aria-describedby={ayuda ? idAyuda : undefined}
        className="flex flex-col gap-6"
      >
        {partes.map((parte) => (
          <RejillaDeTarjetas key={parte.clave} seccion={parte} valor={valor} />
        ))}
        {plegable && (
          <div className="flex flex-col gap-4">
            <button
              type="button"
              aria-expanded={plegable.abierto}
              aria-controls={plegable.abierto ? idPlegable : undefined}
              disabled={plegable.bloqueado}
              onClick={() => plegable.onCambioAbierto(!plegable.abierto)}
              className="flex w-fit items-center gap-2 rounded-control border border-borde bg-superficie px-3 py-2 text-base font-semibold text-texto transition-colors duration-(--motion-fast) hover:border-acento disabled:cursor-default disabled:opacity-70"
            >
              <ChevronDown
                className={cn("size-5 transition-transform duration-(--motion-fast)", plegable.abierto && "rotate-180")}
                aria-hidden
              />
              {plegable.titulo}
            </button>
            {plegable.bloqueado && (
              <p className="text-sm text-texto-suave">Se queda abierto mientras la acción elegida sea una de estas.</p>
            )}
            {/* Cerrado no se monta nada: un radio oculto seguiría siendo parada del teclado. */}
            {plegable.abierto && (
              <div id={idPlegable} className="flex flex-col gap-6">
                {seccionesMontadas(plegable.secciones, plegable.abierto).map((seccion) => (
                  <RejillaDeTarjetas key={seccion.clave} seccion={seccion} valor={valor} />
                ))}
              </div>
            )}
          </div>
        )}
      </RadioGroup>
    </fieldset>
  );
}

/** Una parte de la lista: su subtítulo, si lo tiene, y sus tarjetas. No abre un grupo de radios nuevo. */
function RejillaDeTarjetas({ seccion, valor }: { seccion: SeccionVisual; valor: string }) {
  if (seccion.opciones.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {seccion.titulo && <p className="text-lg font-bold text-texto">{seccion.titulo}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {seccion.opciones.map((o) => (
          <Tarjeta key={o.valor} opcion={o} elegida={valor === o.valor} />
        ))}
      </div>
    </div>
  );
}

function Tarjeta({ opcion: o, elegida }: { opcion: OpcionVisual; elegida: boolean }) {
  const texto = textoDeTarjeta(o);
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: Base UI renderiza el control dentro de la etiqueta
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-tarjeta border p-4 transition-colors duration-(--motion-fast)",
        "hover:border-acento has-disabled:cursor-default has-disabled:opacity-50",
        elegida ? "border-acento bg-elevada ring-2 ring-acento/35" : "border-borde bg-superficie",
      )}
    >
      <Radio.Root
        value={o.valor}
        className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-borde bg-superficie data-checked:border-acento"
      >
        <Radio.Indicator className="size-2.5 rounded-full bg-acento data-unchecked:hidden" />
      </Radio.Root>
      <span className="text-texto">{o.pictograma}</span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2 font-semibold text-texto">
          {o.nombre}
          {o.etiqueta && (
            <span className="rounded-full bg-elevada px-2 py-0.5 text-xs font-medium text-texto-suave">
              {o.etiqueta}
            </span>
          )}
        </span>
        {texto && <span className="text-sm text-texto-suave">{texto}</span>}
      </span>
    </label>
  );
}
