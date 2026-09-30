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
];

/** Pares de componentes (bordes y foco) que tienen que cumplir 3:1. Avisan. */
export const PARES_COMPONENTE: readonly [ClaveTema, ClaveTema][] = [
  ["border", "background"],
  ["border", "surface"],
  ["focus", "background"],
  ["focus", "surface"],
];

/** Texto fijo de las pegatinas (creator.tsx): se pinta sobre el color vibrante mezclado al 75 % con blanco. */
const TEXTO_PEGATINA = "#182032";

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

const mezclaConBlanco = (hex: string) =>
  `#${[1, 3, 5]
    .map((i) =>
      Math.round(Number.parseInt(hex.slice(i, i + 2), 16) * 0.75 + 255 * 0.25)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;

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
    for (const [fg, bg] of PARES_COMPONENTE) {
      comprobar(avisos, { modo, delante: fg, detras: bg, minimo: MINIMO_COMPONENTE }, t[fg], t[bg]);
    }
    for (const [clave, valor] of Object.entries(v)) {
      comprobar(
        avisos,
        { modo, delante: "texto de pegatina", detras: `vibrant.${clave} (pegatina)`, minimo: MINIMO_TEXTO },
        TEXTO_PEGATINA,
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
