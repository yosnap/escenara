import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { EscenaVista, ProyectoDetalle } from "@/lib/proyectos";

/**
 * Render de la lista de escenas con un orden ya soltado y sin guardar: el aviso, los números renumerados, los
 * botones y lo que queda deshabilitado. El editor de cada escena se sustituye por un resto mínimo: aquí se prueba
 * la lista, no la escena.
 */
mock.module("./editor-escena", () => ({
  EditorEscena: ({ escena }: { escena: EscenaVista }) => <p data-escena={escena.id}>Texto de {escena.id}</p>,
}));
const { ListaEscenas } = await import("./lista-escenas");

const escena = (id: string, orden: number, estado: EscenaVista["estado"] = "borrador"): EscenaVista =>
  ({ id, orden, estado }) as EscenaVista;

const detalle = {
  proyecto: { id: "p1", acento: "coral" },
  escenas: [escena("a", 1), escena("b", 2, "aprobada"), escena("c", 3)],
} as unknown as ProyectoDetalle;

const pintar = (ordenPendienteInicial: string[] | null, d: ProyectoDetalle = detalle) =>
  renderToStaticMarkup(
    <ListaEscenas
      detalle={d}
      personajes={[]}
      trends={[]}
      onCambio={() => {}}
      onError={() => {}}
      ordenPendienteInicial={ordenPendienteInicial}
    />,
  );

describe("lista de escenas con orden pendiente", () => {
  const html = pintar(["c", "a", "b"]);

  test("avisa de que el orden no está guardado, con Guardar orden y Descartar", () => {
    expect(html).toContain("Orden sin guardar.");
    expect(html).toContain("Guardar orden");
    expect(html).toContain("Descartar");
  });

  test("el anuncio va aparte del control: región viva vacía de botones, y los botones fuera de ella", () => {
    const vivas = html.match(/<p role="status"[^>]*>[^<]*<\/p>/g) ?? [];
    expect(vivas.some((v) => v.includes("Orden sin guardar. Guárdalo o descártalo"))).toBe(true);
    expect(html).not.toMatch(/role="status"[^>]*>(?:(?!<\/[a-z]+>).)*<button/);
    expect(html).toContain('aria-label="Orden de las escenas sin guardar"');
  });

  test("muestra las escenas en el orden pendiente y renumeradas", () => {
    const posiciones = ["c", "a", "b"].map((id) => html.indexOf(`data-escena="${id}"`));
    expect(posiciones.every((p) => p > 0)).toBe(true);
    expect([...posiciones].sort((x, y) => x - y)).toEqual(posiciones);
    expect(html).toContain('aria-label="Cambiar el orden de escena 1"');
    expect(html).toContain('aria-label="Cambiar el orden de escena 3"');
  });

  test("Añadir escena queda desactivada mientras haya orden pendiente", () => {
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*Añadir escena/);
  });

  test("dice lo que no se traslada: el gancho se queda escrito en la escena que era la primera", () => {
    expect(html).toContain("no se traslada");
    expect(html).toContain("no quita su aprobación");
  });

  test("la lista es ordenada, para que un lector de pantalla oiga la posición", () => {
    expect(html).toContain('<ol aria-label="Escenas del guion, en el orden en el que se verán"');
  });

  test("sin orden pendiente no hay aviso y Añadir escena está activa", () => {
    const limpio = pintar(null);
    expect(limpio).not.toContain("Guardar orden");
    expect(limpio).not.toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*Añadir escena/);
  });

  test("si se borra una escena, el orden pendiente de las que quedan se conserva", () => {
    const sinB = { ...detalle, escenas: [escena("a", 1), escena("c", 2)] } as unknown as ProyectoDetalle;
    const tras = pintar(["c", "a", "b"], sinB);
    expect(tras).toContain("Orden sin guardar.");
    expect(tras.indexOf('data-escena="c"')).toBeLessThan(tras.indexOf('data-escena="a"'));
  });
});
