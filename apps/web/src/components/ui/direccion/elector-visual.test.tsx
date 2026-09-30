import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ElectorVisual, type OpcionVisual, textoDeTarjeta } from "./elector-visual";

/**
 * Cada tarjeta dice **una sola cosa**, y las cabeceras de grupo se ven: título grande y en negrita, con su icono
 * y su explicación. Se comprueba sobre el HTML que llega a la pantalla.
 */

const opcion = (valor: string, extra: Partial<OpcionVisual> = {}): OpcionVisual => ({
  valor,
  nombre: `Nombre ${valor}`,
  frase: `Frase del dibujo ${valor}.`,
  pictograma: <svg aria-hidden />,
  ...extra,
});

const pintar = (opciones: OpcionVisual[], extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    <ElectorVisual
      etiqueta="Gesto"
      ayuda="Qué hace mientras habla."
      opciones={opciones}
      valor=""
      onCambio={() => {}}
      {...extra}
    />,
  );

describe("el texto de una tarjeta", () => {
  test("gana la descripción del catálogo cuando existe", () => {
    const o = opcion("a", { descripcion: "Descripción de quien administra." });
    expect(textoDeTarjeta(o)).toBe("Descripción de quien administra.");
    const html = pintar([o]);
    expect(html).toContain("Descripción de quien administra.");
    expect(html).not.toContain("Frase del dibujo a.");
  });

  test("sin descripción sale la frase del dibujo, y nunca las dos", () => {
    const html = pintar([opcion("b")]);
    expect(html).toContain("Frase del dibujo b.");
    expect(html.match(/text-sm text-texto-suave/g)?.length).toBe(1);
  });

  test("una descripción en blanco no tapa la frase", () => {
    expect(textoDeTarjeta(opcion("c", { descripcion: "   " }))).toBe("Frase del dibujo c.");
  });

  test("una tarjeta con las dos redacciones distintas pinta solo una", () => {
    const html = pintar([
      opcion("d", {
        frase: "Lo gira hacia la cámara con la etiqueta de frente, para que se lea.",
        descripcion: "Lo gira hacia la cámara con la etiqueta de frente.",
      }),
    ]);
    expect(html).toContain("Lo gira hacia la cámara con la etiqueta de frente.");
    expect(html).not.toContain("para que se lea");
  });
});

describe("la cabecera del grupo", () => {
  test("el título es grande y en negrita, y la explicación se lee con color", () => {
    const html = pintar([opcion("a")]);
    expect(html).toContain("<legend");
    expect(html).toMatch(/text-xl[^"]*text-v-cobalto|font-extrabold[^"]*text-xl/);
    expect(html).toContain("font-extrabold");
    expect(html).toContain("Qué hace mientras habla.");
    expect(html).toContain("text-acento");
    // La opción elegida y las cabeceras se marcan con color de texto y borde entero, nunca con una franja lateral.
    expect(html).not.toMatch(/border-[lr]-/);
  });

  test("cada familia de grupos tiene su tono", () => {
    expect(pintar([opcion("a")], { tono: "producto" })).toContain("text-creativo");
    expect(pintar([opcion("a")], { tono: "detalle" })).toContain("text-v-fucsia");
  });
});

describe("una lista con partes", () => {
  const html = pintar([opcion("a")], {
    tituloOpciones: "General",
    secciones: [{ clave: "s", titulo: "Otra parte", opciones: [opcion("b")] }],
    plegable: {
      titulo: "Más acciones",
      abierto: false,
      onCambioAbierto: () => {},
      secciones: [{ clave: "p", titulo: "Plegada", opciones: [opcion("c")] }],
    },
    resumen: "Elegida: ninguna",
  });

  test("sigue siendo un único grupo de radios con subtítulos", () => {
    expect(html.match(/role="radiogroup"/g)?.length).toBe(1);
    expect(html).toContain("General");
    expect(html).toContain("Otra parte");
    expect(html).toContain("Plegada");
  });

  test("el bloque plegado empieza cerrado y el botón lo dice", () => {
    expect(html).toContain('aria-expanded="false"');
    expect(html).toMatch(/<div id="[^"]*" hidden=""/);
  });

  test("el resumen se anuncia a los lectores de pantalla", () => {
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Elegida: ninguna");
  });
});
