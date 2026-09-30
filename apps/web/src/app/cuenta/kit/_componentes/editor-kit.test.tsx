import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PreviaKit } from "@/components/ui/previa-kit";
import { TEXTO_ETIQUETA_SINTETICA } from "@/lib/montaje";
import { EditorKit } from "./editor-kit";

const logo = {
  id: crypto.randomUUID(),
  url: "/api/marca/activos/x",
  mime: "image/png",
  ancho: 400,
  alto: 200,
  familia: null,
  licencia: null,
};

describe("/cuenta/kit", () => {
  test("pinta el kit con su previsualización sobre el fotograma real y la etiqueta obligatoria", () => {
    const html = renderToStaticMarkup(
      <EditorKit
        kitInicial={{ nombre: "Estudio Ana", logo, esquina: "abajo-derecha", activo: true }}
        fotograma="/api/media/1/archivo"
      />,
    );
    expect(html).toContain('value="Estudio Ana"');
    expect(html).toContain('src="/api/media/1/archivo"');
    expect(html).toContain(TEXTO_ETIQUETA_SINTETICA);
    expect(html).toContain("Esquina del logotipo");
    expect(html).toContain("Aplicar a mis exportaciones");
    expect(html).toContain("Quitar el logotipo");
    expect(html).toContain("La etiqueta de contenido generado con IA va siempre");
    // Con la etiqueta abajo (lo de serie), el logotipo elegido abajo a la derecha sube arriba a la derecha.
    expect(html).toContain('data-esquina-logo="arriba-derecha"');
    expect(html).toContain("pasa a arriba a la derecha para no taparla");
  });

  test("sin logotipo lo dice y no pinta ninguno; la etiqueta sigue ahí", () => {
    const html = renderToStaticMarkup(
      <EditorKit
        kitInicial={{ nombre: "", logo: null, esquina: "arriba-derecha", activo: true }}
        fotograma="/escaparate/lucia.webp"
      />,
    );
    expect(html).toContain("Sube un logotipo para verlo sobre el fotograma.");
    expect(html).not.toContain("data-esquina-logo");
    expect(html).not.toContain("Quitar el logotipo");
    expect(html).toContain('data-etiqueta="abajo"');
  });

  test("la previsualización nunca pone el logotipo en la franja de la etiqueta", () => {
    for (const etiqueta of ["arriba", "abajo"] as const) {
      for (const esquina of ["arriba-izquierda", "arriba-derecha", "abajo-izquierda", "abajo-derecha"] as const) {
        const html = renderToStaticMarkup(
          <PreviaKit fotograma="/f.webp" logo="/l.png" esquina={esquina} etiqueta={etiqueta} />,
        );
        const pintada = html.match(/data-esquina-logo="([a-z-]+)"/)?.[1] ?? "";
        expect(pintada.startsWith(etiqueta)).toBe(false);
      }
    }
  });
});
