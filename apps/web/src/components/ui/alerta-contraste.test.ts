import { describe, expect, it } from "bun:test";
import path from "node:path";
import { contraste, type Marca } from "@/lib/tokens";
import { ESTILO_ALERTA, type TipoAlerta } from "./alerta";

/**
 * Contraste de los pares **reales** de la alerta, leídos de sus propias clases, en tema claro y oscuro:
 *
 * - el rótulo del tipo (texto pequeño en negrita) sobre la superficie: 4,5:1;
 * - el número destacado sobre su círculo de color translúcido: 4,5:1;
 * - el borde, mezclado con la superficie según su opacidad: 3:1 (componente de interfaz);
 * - «Ir al campo» en azul de marca sobre la fila destacada (superficie elevada): 4,5:1.
 */
const raiz = path.resolve(import.meta.dir, "../../../../..");
const marca = (await Bun.file(path.join(raiz, "docs/branding/escenara.brand.json")).json()) as Marca;

/** Nombre del color en las clases → nombre del token de la marca. */
const TOKEN: Record<string, string> = { error: "danger", aviso: "warning", correcto: "success", acento: "primary" };

const rgb = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
const hex = (c: number[]) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
/** Color con opacidad `alfa` (0–1) pintado encima de `fondo`. */
const mezcla = (color: string, alfa: number, fondo: string) => {
  const [a, b] = [rgb(color), rgb(fondo)];
  return hex(a.map((v, i) => v * alfa + (b[i] as number) * (1 - alfa)));
};

/** Color y opacidad de una clase como `border-aviso/80` o `bg-error/12`. */
function colorDe(clase: string, prefijo: string, tema: Record<string, unknown>): { color: string; alfa: number } {
  const m = clase.match(new RegExp(`\\b${prefijo}-(\\w+)(?:/(\\d+))?`));
  const token = m ? TOKEN[m[1] as string] : undefined;
  if (!m || !token) throw new Error(`Clase sin color conocido: ${clase}`);
  return { color: tema[token] as string, alfa: m[2] ? Number(m[2]) / 100 : 1 };
}

describe("contraste de la alerta", () => {
  for (const modo of ["light", "dark"] as const) {
    const tema = marca.theme[modo] as Record<string, unknown>;
    const superficie = tema.surface as string;
    for (const tipo of Object.keys(ESTILO_ALERTA) as TipoAlerta[]) {
      const estilo = ESTILO_ALERTA[tipo];
      const texto = colorDe(estilo.texto, "text", tema).color;

      it(`${modo} · ${tipo}: rótulo sobre la superficie ≥ 4,5:1`, () => {
        expect(contraste(texto, superficie)).toBeGreaterThanOrEqual(4.5);
      });

      it(`${modo} · ${tipo}: número sobre su círculo ≥ 4,5:1`, () => {
        const circulo = colorDe(estilo.circulo, "bg", tema);
        expect(contraste(texto, mezcla(circulo.color, circulo.alfa, superficie))).toBeGreaterThanOrEqual(4.5);
      });

      it(`${modo} · ${tipo}: borde sobre la superficie ≥ 3:1`, () => {
        const borde = colorDe(estilo.borde, "border", tema);
        expect(contraste(mezcla(borde.color, borde.alfa, superficie), superficie)).toBeGreaterThanOrEqual(3);
      });
    }

    it(`${modo}: «Ir al campo» sobre la fila destacada ≥ 4,5:1`, () => {
      expect(contraste(tema.primary as string, tema.surfaceRaised as string)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
