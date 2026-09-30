import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ModeloElegible } from "@/lib/catalogo";
import type { Medio } from "@/lib/media/tipos";
import { AvisoProporcionDelFotograma } from "./aviso-proporcion-del-fotograma";

const modelo = (id: string, nombre: string, proporciones: string[]) =>
  ({ modelo: id, nombre, proporciones }) as unknown as ModeloElegible;
const modelos = [
  modelo("veo3_lite", "Veo 3 Lite", ["9:16", "16:9"]),
  modelo("hailuo", "Hailuo 2.3", []),
  modelo("kling", "Kling 3", ["9:16"]),
];
const imagen = (ancho: number, alto: number) => ({ ancho, alto }) as Medio;

const pintar = (origen: Medio, elegido = "veo3_lite") =>
  renderToStaticMarkup(
    <AvisoProporcionDelFotograma origen={origen} modelos={modelos} modeloElegido={elegido} onModelo={() => {}} />,
  );

describe("el aviso de proporción del fotograma en «Crear»", () => {
  test("una imagen vertical con un modelo que hace 9:16 no avisa de nada", () => {
    expect(pintar(imagen(768, 1344))).toBe("");
  });

  test("una imagen 4:5 con Veo avisa, ofrece los modelos que la animan y la vía de recortarla", () => {
    const html = pintar(imagen(1080, 1350));
    expect(html).toContain("no está en ninguna proporción que Veo 3 Lite sepa animar");
    expect(html).toContain("Usar Hailuo 2.3");
    expect(html).not.toContain("Usar Kling 3");
    expect(html).toContain("recórtala a 9:16 en tu biblioteca");
    expect(html).toContain('href="/biblioteca"');
  });

  test("con un modelo que toma la proporción de la imagen no hay nada que avisar", () => {
    expect(pintar(imagen(1080, 1350), "hailuo")).toBe("");
  });
});
