import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { GruposAjustes } from "./grupos-ajustes";
import { Seccion } from "./seccion-ajustes";

test("solo el grupo visible participa en la validación nativa, conservando controles pendientes", () => {
  for (const activo of [0, 1]) {
    const html = renderToStaticMarkup(
      <GruposAjustes activo={activo} cambiar={() => {}}>
        <Seccion titulo="Registro" descripcion="" icono={null}>
          <input name="registro" defaultValue="pendiente" />
        </Seccion>
        <Seccion titulo="Generación" descripcion="" icono={null}>
          <input name="coste" type="number" step="0.0001" defaultValue="0.000123" />
        </Seccion>
      </GruposAjustes>,
    );
    const grupos = [...html.matchAll(/<fieldset([^>]*)>(.*?)<\/fieldset>/gs)];
    expect(grupos).toHaveLength(5);
    for (const [i, grupo] of grupos.entries()) {
      expect(grupo[1]?.includes('disabled=""')).toBe(i !== activo);
      expect(grupo[1]?.includes('hidden=""')).toBe(i !== activo);
    }
    expect(grupos[0]?.[2]).toContain('value="pendiente"');
    expect(grupos[1]?.[2]).toContain('value="0.000123"');
  }
});
