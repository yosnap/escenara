import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { DemoPlantilla } from "@/lib/demo-plantilla";
import { DemoDePlantilla } from "./demo-plantilla";

const IMAGEN: DemoPlantilla = {
  tipo: "imagen",
  url: "/api/prompts/plantillas/p1/demo?v=0a1b2c3d",
  alt: "Una cafetería luminosa",
  ancho: 1080,
  alto: 1920,
};
const CLIP: DemoPlantilla = { ...IMAGEN, tipo: "video", alt: "Una mano abre la caja" };

describe("ejemplo de una plantilla", () => {
  test("una imagen lleva su texto alternativo, sus medidas y carga perezosa", () => {
    const html = renderToStaticMarkup(<DemoDePlantilla demo={IMAGEN} titulo="Ejemplo de «Fotograma para redes»" />);
    expect(html).toContain('alt="Una cafetería luminosa"');
    expect(html).toContain('src="/api/prompts/plantillas/p1/demo?v=0a1b2c3d"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('width="1080"');
    expect(html).toContain("aspect-ratio:1080 / 1920");
    expect(html).toContain("Ejemplo de «Fotograma para redes»");
    expect(html).not.toContain("<video");
  });

  test("un clip lleva controles, va silenciado, no se descarga hasta reproducirlo y nunca arranca solo", () => {
    const html = renderToStaticMarkup(<DemoDePlantilla demo={CLIP} />);
    expect(html).toContain("<video");
    expect(html).toContain("controls");
    expect(html).toContain("muted");
    expect(html).toContain('preload="none"');
    expect(html).toContain('aria-label="Una mano abre la caja"');
    expect(html).not.toContain("autoplay");
    expect(html).not.toContain("<img");
  });

  test("sin medidas guardadas reserva un hueco razonable para que la página no salte", () => {
    const html = renderToStaticMarkup(<DemoDePlantilla demo={{ ...IMAGEN, ancho: null, alto: null }} />);
    expect(html).toContain("aspect-ratio:3 / 4");
    expect(html).toContain("min-height:10rem");
  });
});
