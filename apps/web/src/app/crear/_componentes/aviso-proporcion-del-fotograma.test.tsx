import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ModeloElegible } from "@/lib/catalogo";
import { AvisoProporcionDelFotograma } from "./aviso-proporcion-del-fotograma";

const modelo = (id: string, nombre: string, proporciones: string[]) =>
  ({ modelo: id, nombre, proporciones }) as unknown as ModeloElegible;
const modelos = [
  modelo("veo3_lite", "Veo 3 Lite", ["9:16"]),
  modelo("hailuo", "Hailuo 2.3", []),
  modelo("kling", "Kling 3", ["9:16"]),
];

const pintar = (proporcionDelFotograma: string | null, elegido = "veo3_lite") =>
  renderToStaticMarkup(
    <AvisoProporcionDelFotograma
      proporcionDelFotograma={proporcionDelFotograma}
      modelos={modelos}
      modeloElegido={elegido}
      onModelo={() => {}}
    />,
  );

describe("el aviso de proporción del fotograma en «Crear»", () => {
  test("con una foto propia (aunque sea 3:4) y Veo no avisa: el servidor la envía como siempre", () => {
    expect(pintar(null)).toBe("");
  });

  test("un fotograma generado en 9:16 con Veo no avisa de nada", () => {
    expect(pintar("9:16")).toBe("");
  });

  test("un fotograma generado en 4:5 con Veo avisa con el motivo del servidor, los modelos que lo animan y recortar", () => {
    const html = pintar("4:5");
    expect(html).toContain("El fotograma está en 4:5 y Veo 3 Lite solo hace clips en 9:16");
    expect(html).toContain("Usar Hailuo 2.3");
    expect(html).not.toContain("Usar Kling 3");
    expect(html).toContain("recórtalo a 9:16 en tu Biblioteca");
    expect(html).toContain('href="/biblioteca"');
    // Antes de confirmar no se habla de reservas ni cobros: eso lo dice el servidor si llega a pedirse.
    expect(html).not.toContain("reservado");
  });

  test("con un modelo que toma la proporción de la imagen no hay nada que avisar", () => {
    expect(pintar("4:5", "hailuo")).toBe("");
  });
});
