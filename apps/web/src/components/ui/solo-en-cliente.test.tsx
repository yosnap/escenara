import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SoloEnCliente } from "./solo-en-cliente";

/**
 * Lo que importa es el HTML del **servidor**: no debe llevar ningún campo, porque un campo en ese HTML es lo que
 * una extensión decora antes de hidratar y lo que hace fallar la hidratación.
 */
describe("SoloEnCliente", () => {
  test("en el servidor pinta la reserva y no los hijos", () => {
    const html = renderToStaticMarkup(
      <SoloEnCliente reserva={<p>Cargando…</p>}>
        <input aria-label="campo" />
      </SoloEnCliente>,
    );
    expect(html).toContain("Cargando…");
    expect(html).not.toContain("<input");
  });

  test("sin reserva no pinta nada en el servidor", () => {
    const html = renderToStaticMarkup(
      <SoloEnCliente>
        <input aria-label="campo" />
      </SoloEnCliente>,
    );
    expect(html).toBe("");
  });
});
