import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Recomendadas, type TipoRecomendable } from "./recomendadas";

/** Las recomendaciones de la instalación se ordenan arrastrando; las flechas quedan como alternativa con nombre. */

const tipo: TipoRecomendable = {
  tipo: "imagen",
  entradas: [
    { proveedor: "kie", compatibleId: null, modelo: "modelo-a" },
    { proveedor: "kie", compatibleId: null, modelo: "modelo-b" },
  ],
  opciones: [
    { proveedor: "kie", modelo: "modelo-a", etiqueta: "Modelo A" },
    { proveedor: "kie", modelo: "modelo-b", etiqueta: "Modelo B" },
  ],
  deducidas: false,
};

describe("recomendaciones de modelos", () => {
  const html = renderToStaticMarkup(<Recomendadas tipos={[tipo]} />);

  test("cada modelo tiene su asa enfocable con nombre", () => {
    expect(html).toContain('aria-label="Cambiar el orden de Modelo A"');
    expect(html).toContain('aria-label="Cambiar el orden de Modelo B"');
  });

  test("dice cómo se coge y se suelta con el teclado", () => {
    expect(html).toContain("Espacio para coger");
  });

  test("las flechas siguen como alternativa, con nombre accesible", () => {
    expect(html).toContain('aria-label="Subir Modelo B"');
    expect(html).toContain('aria-label="Bajar Modelo A"');
    expect(html).toContain('aria-label="Quitar Modelo A"');
  });
});
