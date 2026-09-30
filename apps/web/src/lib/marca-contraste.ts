import type { ClaveTema, DocumentoMarca, ModoMarca } from "./marca-esquema";
import { MODOS_MARCA } from "./marca-esquema";
import { contraste } from "./tokens";

/**
 * **Contraste AA de una marca** en los dos temas (WCAG 2.x), el mismo que comprueba `tokens.test.ts` sobre la marca de
 * referencia.
 *
 * - Los pares de **texto sobre fondo** (4,5:1) **bloquean** la publicación: una marca que no se puede leer no se
 *   publica, se diga lo que se diga en el editor.
 * - Los de **componentes** (bordes y foco, 3:1) y los usos de los **colores vibrantes** (pegatinas, titulares, cabeceras)
 *   **avisan**: se ven peor, pero no dejan a nadie sin poder leer un texto.
 *
 * Los pares salen de **lo que pinta la interfaz**, no solo de los tokens básicos: los estados (correcto, aviso, error)
 * también van sobre la superficie elevada y el fondo, el contador del admin es `onPrimary` sobre `warning`, las
 * etiquetas del historial van sobre su propio color al 12 % y los números de paso, el preset elegido y el distintivo de
 * «generada» son texto oscuro fijo sobre la chispa. Todos esos son texto que alguien tiene que leer, así que bloquean.
 */

export const MINIMO_TEXTO = 4.5;
export const MINIMO_COMPONENTE = 3;

/** Pares de texto sobre fondo que tienen que cumplir 4,5:1. Si falla uno, no se publica. */
export const PARES_TEXTO: readonly [ClaveTema, ClaveTema][] = [
  ["text", "background"],
  ["text", "surface"],
  ["text", "surfaceRaised"],
  ["textMuted", "background"],
  ["textMuted", "surface"],
  ["textMuted", "surfaceRaised"],
  ["primary", "background"],
  ["primary", "surface"],
  ["primary", "surfaceRaised"],
  ["onPrimary", "primary"],
  ["creative", "surface"],
  ["creative", "surfaceRaised"],
  ["success", "surface"],
  ["warning", "surface"],
  ["danger", "surface"],
  ["success", "surfaceRaised"],
  ["warning", "surfaceRaised"],
  ["danger", "surfaceRaised"],
  ["success", "background"],
  ["warning", "background"],
  ["danger", "background"],
  ["onPrimary", "warning"],
];

/** Colores de estado que se pintan como texto sobre su propio color al 12 % (etiquetas del historial de versiones). */
export const TONOS_TINTADOS: readonly ClaveTema[] = ["primary", "success", "warning", "danger"];
const OPACIDAD_TINTE = 0.12;

/** Pares de componentes (bordes y foco) que tienen que cumplir 3:1. Avisan. */
export const PARES_COMPONENTE: readonly [ClaveTema, ClaveTema][] = [
  ["border", "background"],
  ["border", "surface"],
  ["focus", "background"],
  ["focus", "surface"],
];

/**
 * Texto oscuro fijo de la interfaz (`text-[#182032]`): el de las pegatinas (sobre el vibrante mezclado al 75 % con
 * blanco) y el de todo lo que va sobre la chispa (el degradado coral → sol y `brandSpark`).
 */
export const TEXTO_FIJO_OSCURO = "#182032";

export interface ParContraste {
  modo: ModoMarca;
  delante: string;
  detras: string;
  razon: number;
  minimo: number;
}

export interface RevisionContraste {
  /** Pares de texto que no llegan: impiden publicar. */
  bloqueos: ParContraste[];
  /** Pares de componentes o de colores vibrantes que no llegan: se avisa y se puede publicar. */
  avisos: ParContraste[];
}

/** `color` al `proporcion` sobre `fondo`, como `color-mix(in srgb, …)` o una opacidad de Tailwind sobre un sólido. */
export const mezclar = (color: string, fondo: string, proporcion: number) =>
  `#${[1, 3, 5]
    .map((i) =>
      Math.round(
        Number.parseInt(color.slice(i, i + 2), 16) * proporcion +
          Number.parseInt(fondo.slice(i, i + 2), 16) * (1 - proporcion),
      )
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;

const mezclaConBlanco = (hex: string) => mezclar(hex, "#FFFFFF", 0.75);

/** Redondea hacia abajo a dos decimales: 4,499 se enseña 4,49 y no 4,5, que parecería que pasa. */
const redondear = (razon: number) => Math.floor(razon * 100) / 100;

export function revisarContraste(marca: DocumentoMarca): RevisionContraste {
  const bloqueos: ParContraste[] = [];
  const avisos: ParContraste[] = [];
  const comprobar = (lista: ParContraste[], par: Omit<ParContraste, "razon">, a: string, b: string) => {
    const razon = contraste(a, b);
    if (razon < par.minimo) lista.push({ ...par, razon: redondear(razon) });
  };

  for (const modo of MODOS_MARCA) {
    const t = marca.theme[modo];
    const v = marca.vibrant[modo];
    for (const [fg, bg] of PARES_TEXTO) {
      comprobar(bloqueos, { modo, delante: fg, detras: bg, minimo: MINIMO_TEXTO }, t[fg], t[bg]);
    }
    // La chispa lleva texto de verdad (números de paso, el preset elegido, «generada»): los dos extremos del degradado
    // y el propio `brandSpark` tienen que leerse con el texto oscuro fijo.
    for (const [detras, color] of [
      ["vibrant.coral (degradado chispa)", v.coral],
      ["vibrant.sun (degradado chispa)", v.sun],
      ["brandSpark", t.brandSpark],
    ] as const) {
      comprobar(
        bloqueos,
        { modo, delante: "texto oscuro fijo", detras, minimo: MINIMO_TEXTO },
        TEXTO_FIJO_OSCURO,
        color,
      );
    }
    for (const tono of TONOS_TINTADOS) {
      comprobar(
        bloqueos,
        { modo, delante: tono, detras: `${tono} al 12 % sobre surface`, minimo: MINIMO_TEXTO },
        t[tono],
        mezclar(t[tono], t.surface, OPACIDAD_TINTE),
      );
    }
    for (const [fg, bg] of PARES_COMPONENTE) {
      comprobar(avisos, { modo, delante: fg, detras: bg, minimo: MINIMO_COMPONENTE }, t[fg], t[bg]);
    }
    for (const [clave, valor] of Object.entries(v)) {
      comprobar(
        avisos,
        { modo, delante: "texto de pegatina", detras: `vibrant.${clave} (pegatina)`, minimo: MINIMO_TEXTO },
        TEXTO_FIJO_OSCURO,
        mezclaConBlanco(valor),
      );
    }
    // Titulares y cabeceras de grupo en cobalto y fucsia: texto grande, 3:1 sobre las tres superficies.
    for (const clave of ["cobalt", "fuchsia"] as const) {
      for (const superficie of ["background", "surface", "surfaceRaised"] as const) {
        comprobar(
          avisos,
          { modo, delante: `vibrant.${clave}`, detras: superficie, minimo: MINIMO_COMPONENTE },
          v[clave],
          t[superficie],
        );
      }
    }
  }
  return { bloqueos, avisos };
}

const NOMBRE_MODO: Record<ModoMarca, string> = { light: "claro", dark: "oscuro" };

/** Frase de un par que no llega, para la alerta del editor y el error del servidor. */
export const describirPar = (p: ParContraste): string =>
  `Tema ${NOMBRE_MODO[p.modo]}: ${p.delante} sobre ${p.detras} da ${p.razon.toFixed(2).replace(".", ",")}:1 y necesita ${String(p.minimo).replace(".", ",")}:1.`;
