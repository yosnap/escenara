import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../cn";

/**
 * **Cabecera de un grupo de controles**: icono, título grande y su explicación. Es lo que separa «Plano» de
 * «Ángulo» o «El producto» de «Escríbelo tú» a un golpe de vista, en lugar de una leyenda pequeña que se pierde
 * entre las tarjetas.
 *
 * Cada familia de grupos tiene su tono para que la pantalla no sea de un solo color y cansen menos:
 *
 * - `direccion`: la cámara y el gesto (cobalto);
 * - `producto`: lo que se muestra y se hace con él (el color creativo de la marca);
 * - `detalle`: el fotograma y lo que escribes tú (fucsia).
 *
 * Solo se usan colores con contraste comprobado en `lib/tokens.test.ts`: el título es texto grande y negrita
 * (3:1 basta) y sale en cobalto, creativo o fucsia; la explicación es texto normal y sale en el acento o el
 * creativo, que superan 4,5:1. Sin bordes laterales de color: el color va en el icono, el título y el texto.
 */

export type TonoGrupo = "direccion" | "producto" | "detalle";

/** Clases de cada tono. Están enteras aquí para que Tailwind las vea al compilar. */
export const TONOS_GRUPO: Record<TonoGrupo, { icono: string; titulo: string; texto: string }> = {
  direccion: { icono: "bg-v-cobalto/15 text-v-cobalto", titulo: "text-v-cobalto", texto: "text-acento" },
  producto: { icono: "bg-creativo/15 text-creativo", titulo: "text-creativo", texto: "text-creativo" },
  detalle: { icono: "bg-v-fucsia/15 text-v-fucsia", titulo: "text-v-fucsia", texto: "text-acento" },
};

/** `principal` es la cabecera de un bloque entero («El producto»); `grupo`, la de cada pregunta dentro de él. */
export type NivelCabecera = "principal" | "grupo";

const TAMANOS: Record<NivelCabecera, { icono: string; chip: string; titulo: string }> = {
  principal: { icono: "size-6", chip: "size-11", titulo: "text-2xl" },
  grupo: { icono: "size-5", chip: "size-9", titulo: "text-xl" },
};

/** El icono y el título, sin la explicación. Dentro de un `<legend>` o de un encabezado, que es quien pone el rol. */
export function TituloGrupo({
  icono: Icono,
  titulo,
  tono,
  nivel = "grupo",
}: {
  icono: LucideIcon;
  titulo: string;
  tono: TonoGrupo;
  nivel?: NivelCabecera;
}) {
  const t = TONOS_GRUPO[tono];
  const tam = TAMANOS[nivel];
  return (
    <span className="flex items-center gap-3">
      <span className={cn("flex shrink-0 items-center justify-center rounded-control", tam.chip, t.icono)}>
        <Icono className={tam.icono} aria-hidden />
      </span>
      <span className={cn("font-extrabold leading-tight", tam.titulo, t.titulo)}>{titulo}</span>
    </span>
  );
}

/** La explicación de un grupo: más grande y con color, para que se lea antes de mirar las tarjetas. */
export function ExplicacionGrupo({
  tono,
  id,
  children,
  className,
}: {
  tono: TonoGrupo;
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <p id={id} className={cn("text-base font-medium leading-snug", TONOS_GRUPO[tono].texto, className)}>
      {children}
    </p>
  );
}

/** Cabecera completa con un encabezado real (`h4`/`h5`): la de «Dirección del clip», «El producto»… */
export function CabeceraGrupo({
  como: Encabezado = "h4",
  icono,
  titulo,
  descripcion,
  tono,
  nivel = "principal",
}: {
  como?: "h3" | "h4" | "h5";
  icono: LucideIcon;
  titulo: string;
  descripcion?: string;
  tono: TonoGrupo;
  nivel?: NivelCabecera;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Encabezado>
        <TituloGrupo icono={icono} titulo={titulo} tono={tono} nivel={nivel} />
      </Encabezado>
      {descripcion && <ExplicacionGrupo tono={tono}>{descripcion}</ExplicacionGrupo>}
    </div>
  );
}
