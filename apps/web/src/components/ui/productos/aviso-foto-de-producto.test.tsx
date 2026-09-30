import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { FotoDeProductoDelClip } from "@/lib/foto-de-producto";
import { AvisoFotoDeProducto } from "./aviso-foto-de-producto";

const SIN_FOTO: FotoDeProductoDelClip = { modelo: "Veo 3.1 Lite", admite: false, alternativas: ["MiniMax H3"] };

const pintar = (foto: FotoDeProductoDelClip | null | undefined, referencias = 2) =>
  renderToStaticMarkup(<AvisoFotoDeProducto foto={foto} referencias={referencias} />);

describe("aviso de la foto del producto junto al selector", () => {
  test("con un modelo que no la admite, dice la causa y con qué modelos sí viaja", () => {
    const html = pintar(SIN_FOTO);
    expect(html).toContain("Veo 3.1 Lite no admite la foto del producto");
    expect(html).toContain("MiniMax H3");
  });

  test("sin ningún modelo que la admita, lo dice", () => {
    expect(pintar({ ...SIN_FOTO, alternativas: [] })).toContain("Hoy no hay ningún modelo activo que la admita");
  });

  test("con un modelo que la admite no sale nada", () => {
    expect(pintar({ modelo: "MiniMax H3", admite: true, alternativas: [] })).toBe("");
  });

  test("sin dato del modelo no sale nada: sin certeza no se avisa", () => {
    expect(pintar(null)).toBe("");
    expect(pintar(undefined)).toBe("");
  });

  test("un producto sin fotos no la pierde: tiene su propio aviso", () => {
    expect(pintar(SIN_FOTO, 0)).toBe("");
  });
});
