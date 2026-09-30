import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SeccionAlertas } from "./alertas";

describe("catálogo: alertas", () => {
  const html = renderToStaticMarkup(<SeccionAlertas />);

  test("enseña los tres tipos y la confirmación de hecho", () => {
    for (const tipo of ["bloqueo", "error", "aviso", "hecho"]) expect(html).toContain(`data-alerta="${tipo}"`);
  });

  test("enseña los estados: descartable, protegido, varios problemas con «Ir al primero» e «Ir al campo»", () => {
    expect(html).toContain('aria-label="Descartar aviso"');
    expect(html.match(/Descartar aviso/g)?.length).toBe(1);
    expect(html).toContain("Ir al primero");
    expect(html).toContain("Ir al campo");
  });

  test("enseña la flecha con movimiento y quieta", () => {
    expect(html.match(/data-flecha-problema/g)?.length).toBe(2);
    expect(html.match(/motion-safe:animate-\[rebote-flecha/g)?.length).toBe(1);
  });
});
