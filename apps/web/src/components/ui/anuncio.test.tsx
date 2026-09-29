import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PanelAnguloFiel } from "./anuncio";

/** El veredicto del ángulo no bloquea nada en ningún modo, y el texto lo dice según el modo. */

const pintar = (enSombra: boolean) =>
  renderToStaticMarkup(
    <PanelAnguloFiel
      decision={null}
      motivo=""
      enSombra={enSombra}
      ocupado={false}
      onComprobar={() => {}}
      onCorregir={() => {}}
    />,
  );

describe("panel del ángulo del anuncio", () => {
  test("en sombra dice que no bloquea nada", () => {
    const html = pintar(true);
    expect(html).toContain("en sombra");
    expect(html).toContain("no bloquea nada");
  });

  test("en Activa ya no dice que decide de verdad: el ángulo todavía no bloquea nada", () => {
    const html = pintar(false);
    expect(html).not.toContain("decide de verdad");
    expect(html).toContain("todavía no bloquea nada");
    expect(html).toContain("Activa");
  });
});
