import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { PresetVista } from "@/lib/presets";
import { VistaPresets } from "./vista-presets";

/**
 * Render de la lista de presets de la instalación: cada categoría es una lista ordenable con su asa enfocable y
 * con nombre, la ayuda del teclado a la vista, y Subir/Bajar como alternativa con el nombre del preset.
 */

const preset = (id: string, categoria: PresetVista["categoria"], nombre: string, orden: number): PresetVista => ({
  id,
  categoria,
  clave: id,
  nombre,
  descripcion: `Descripción de ${nombre}`,
  valores: { prompt: `fragmento ${nombre}` },
  orden,
  activo: true,
  deLaInstalacion: true,
  duplicadoDe: null,
  actualizado: "2026-09-30T10:00:00.000Z",
});

const INICIAL = [
  preset("p1", "especialidad", "Moda", 10),
  preset("p2", "especialidad", "Belleza", 20),
  preset("p3", "estilo", "Natural", 10),
];

describe("presets de la instalación", () => {
  const html = renderToStaticMarkup(<VistaPresets inicial={INICIAL} />);

  test("cada preset tiene su asa enfocable con nombre", () => {
    expect(html).toContain('aria-label="Cambiar el orden de Moda"');
    expect(html).toContain('aria-label="Cambiar el orden de Belleza"');
    expect(html).toContain('aria-label="Cambiar el orden de Natural"');
  });

  test("se ordena dentro de cada categoría: una lista por categoría", () => {
    expect(html).toContain('aria-label="Presets de Especialidad"');
    expect(html.match(/<ol aria-label="Presets de /g)).toHaveLength(2);
  });

  test("dice cómo se coge y se suelta con el teclado", () => {
    expect(html).toContain("Espacio para coger");
    expect(html).toContain("Escape");
  });

  test("Subir y Bajar siguen ahí, con el nombre del preset", () => {
    expect(html).toContain('aria-label="Subir Moda"');
    expect(html).toContain('aria-label="Bajar Belleza"');
  });

  test("el número de orden ya no se enseña ni se edita a mano", () => {
    expect(html).not.toContain("#10");
  });
});
