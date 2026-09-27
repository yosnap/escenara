import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { type ElementoOrdenable, ListaOrdenable } from "./lista-ordenable";
import { PaseAutomatico } from "./pase-automatico";

/**
 * Render de las dos piezas nuevas de la 0.20.2. Se renderizan de verdad con `react-dom/server`: lo que se
 * comprueba es el HTML que acaba en la pantalla, no el código fuente.
 *
 * De la lista ordenable importa que **el teclado no dependa de que haya ratón**: cada elemento tiene su asa
 * enfocable, con nombre, y la ayuda de cómo se coge y se suelta está escrita a la vista.
 */

const ELEMENTOS: ElementoOrdenable[] = ["Lucía de frente", "Lucía de perfil", "Lucía de cuerpo entero"].map(
  (etiqueta, i) => ({
    clave: `r${i}`,
    id: `referencia-r${i}`,
    etiqueta,
    contenido: <p>{etiqueta}</p>,
  }),
);

const lista = (elementos = ELEMENTOS, deshabilitado = false) =>
  renderToStaticMarkup(
    <ListaOrdenable
      elementos={elementos}
      etiquetaLista="Fotos de referencia"
      deshabilitado={deshabilitado}
      onOrden={async () => null}
    />,
  );

describe("lista ordenable", () => {
  test("cada elemento tiene su asa enfocable con nombre, y su posición a la vista", () => {
    const html = lista();
    expect(html).toContain('aria-label="Cambiar el orden de Lucía de frente"');
    expect(html).toContain('aria-label="Cambiar el orden de Lucía de cuerpo entero"');
    // Tres asas: ninguna foto se queda sin poder moverse.
    expect(html.match(/Cambiar el orden de/g)).toHaveLength(3);
    expect(html).toContain('id="referencia-r0"');
  });

  test("dice cómo se coge y se suelta con el teclado, sin obligar a arrastrar", () => {
    const html = lista();
    expect(html).toContain("Espacio para coger");
    expect(html).toContain("las flechas");
    expect(html).toContain("Escape");
  });

  test("con una sola foto no hay nada que ordenar y el asa queda deshabilitada", () => {
    expect(lista(ELEMENTOS.slice(0, 1))).toContain("disabled");
  });

  test("mientras el servidor está contestando no se puede empezar otro movimiento", () => {
    expect(lista(ELEMENTOS, true)).toContain("disabled");
  });
});

describe("pase automático", () => {
  const diapositivas = ["a", "b", "c"].map((clave) => ({ clave, contenido: <p>{clave}</p> }));

  test("lo mueve CSS: hay animación, retardo por diapositiva y punto por cada una", () => {
    const html = renderToStaticMarkup(<PaseAutomatico diapositivas={diapositivas} etiqueta="Fotos de Lucía" />);
    expect(html).toContain("@keyframes");
    expect(html).toContain("animation-delay:3.2s");
    expect(html).toContain("animation-delay:6.4s");
    expect(html).toContain("animation-play-state: paused");
    expect(html).toContain("prefers-reduced-motion");
  });

  test("con una sola imagen no hay pase ni puntos que sobren", () => {
    const html = renderToStaticMarkup(
      <PaseAutomatico diapositivas={diapositivas.slice(0, 1)} etiqueta="Fotos de Lucía" />,
    );
    expect(html).not.toContain("@keyframes");
  });

  test("sin imágenes no pinta nada", () => {
    expect(renderToStaticMarkup(<PaseAutomatico diapositivas={[]} etiqueta="Fotos de Lucía" />)).toBe("");
  });
});
