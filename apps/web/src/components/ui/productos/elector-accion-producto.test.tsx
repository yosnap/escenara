import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { OpcionDireccion } from "@/lib/direccion";
import { ElectorAccionProducto } from "./elector-accion-producto";

const ACCIONES: OpcionDireccion[] = [
  { clave: "abrirlo", nombre: "Abrirlo", descripcion: "Lo abre delante de la cámara." },
  { clave: "moda-giro-360", nombre: "Giro de 360 grados", descripcion: "Gira sobre sí misma." },
  { clave: "skincare-extender", nombre: "Extender el producto", descripcion: "Lo extiende sobre la piel." },
];

const pintar = (accion: string) =>
  renderToStaticMarkup(<ElectorAccionProducto acciones={ACCIONES} accion={accion} onCambio={() => {}} />);

describe("la acción del producto es una sola elección", () => {
  test("una frase arriba lo dice y hay un único grupo de radios", () => {
    const html = pintar("");
    expect(html).toContain("Elige una sola acción entre todas");
    expect(html.match(/role="radiogroup"/g)?.length).toBe(1);
  });

  test("el resumen dice la elegida, sea de la familia que sea", () => {
    expect(pintar("abrirlo")).toContain("Elegida: Abrirlo");
    expect(pintar("moda-giro-360")).toContain("Elegida: Giro de 360 grados");
    expect(pintar("")).toContain("Elegida: ninguna");
  });

  test("moda y cuidado de la piel van plegadas por defecto", () => {
    const html = pintar("abrirlo");
    expect(html).toContain("Más acciones (moda, cuidado de la piel)");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toMatch(/<div id="[^"]*" hidden=""/);
  });

  test("se abren solas si la acción elegida es de moda o de piel", () => {
    for (const accion of ["moda-giro-360", "skincare-extender"]) {
      const html = pintar(accion);
      expect(html).toContain('aria-expanded="true"');
      expect(html).not.toMatch(/<div id="[^"]*" hidden=""/);
    }
  });

  test("las tarjetas dicen una sola línea: la descripción del catálogo", () => {
    const html = pintar("");
    expect(html).toContain("Lo abre delante de la cámara.");
  });
});
