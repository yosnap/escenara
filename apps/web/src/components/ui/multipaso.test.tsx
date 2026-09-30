import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { PasoDelFlujo } from "@/lib/multipaso";
import { Multipaso, PanelDePaso, useMultipaso } from "./multipaso";
import { Paso } from "./paso";

/**
 * Render estático del flujo por pasos: la barra accesible, los estados escritos (no solo color), el bloqueado con su
 * motivo y que solo el paso actual se ve, sin desmontar los demás.
 */
const PASOS: PasoDelFlujo[] = [
  { id: "origen", titulo: "¿De dónde sale el clip?", corto: "Origen", estado: "hecho" },
  { id: "escena", titulo: "Describe la escena", corto: "Escena", estado: "en-curso" },
  { id: "extra", titulo: "Un paso sin visitar", corto: "Extra", estado: "pendiente" },
  {
    id: "coste",
    titulo: "Revisa el coste y confirma",
    corto: "Coste",
    estado: "bloqueado",
    motivo: "Describe antes la escena.",
  },
];

function Prueba({ inicial, pasos = PASOS }: { inicial: string; pasos?: PasoDelFlujo[] }) {
  const control = useMultipaso(pasos, inicial);
  return (
    <Multipaso etiqueta="Pasos para crear" pasos={pasos} control={control}>
      {pasos.map((p, i) => (
        <PanelDePaso key={p.id} id={p.id}>
          <Paso numero={i + 1} titulo={p.titulo}>
            <p>Contenido de {p.id}</p>
          </Paso>
        </PanelDePaso>
      ))}
    </Multipaso>
  );
}

const pintar = (inicial: string, pasos?: PasoDelFlujo[]) =>
  renderToStaticMarkup(<Prueba inicial={inicial} pasos={pasos} />);

describe("barra de pasos", () => {
  const html = pintar("escena");

  test("nav con nombre y lista ordenada", () => {
    expect(html).toContain('<nav aria-label="Pasos para crear"><ol');
    expect(html.match(/<li /g)?.length).toBe(4);
  });

  test("aria-current=step solo en el paso actual", () => {
    expect(html.match(/aria-current="step"/g)?.length).toBe(1);
    expect(html).toMatch(/aria-current="step"[^>]*>.*?Paso 2: Describe la escena \(en curso\)/);
  });

  test("cada estado se dice con palabras, no solo con color", () => {
    for (const texto of ["(hecho)", "(en curso)", "(pendiente)", "(bloqueado)", ">Hecho<", ">Bloqueado<"]) {
      expect(html).toContain(texto);
    }
  });

  test("el bloqueado se puede enfocar, dice que no está disponible y lleva su motivo", () => {
    expect(html).toMatch(/<button type="button" aria-disabled="true" aria-describedby="[^"]+"/);
    expect(html).toContain("Describe antes la escena.");
  });

  test("un paso pendiente sin visitar no se puede abrir con un clic; uno ya visitado sí", () => {
    const elementos = html.split("<li ").slice(1);
    expect(elementos[2]).toContain('disabled=""');
    expect(elementos[2]).toContain("Paso 3: Un paso sin visitar");
    expect(elementos[0]).not.toContain('disabled=""');
  });

  test("anuncia en qué paso estás", () => {
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Paso 2 de 4: Describe la escena");
  });
});

describe("contenido y botones", () => {
  const html = pintar("escena");

  test("todos los paneles están montados, pero solo el actual se ve", () => {
    for (const id of ["origen", "escena", "extra", "coste"]) expect(html).toContain(`Contenido de ${id}`);
    expect(html).toContain('data-panel-paso="escena" tabindex="-1"');
    expect(html.match(/data-panel-paso="[a-z]+" hidden=""/g)?.length).toBe(3);
    expect(html).not.toContain('data-panel-paso="escena" hidden=""');
  });

  test("el título de cada paso es a donde va el foco", () => {
    expect(html).toContain('data-titulo-paso="true" tabindex="-1"');
  });

  test("Anterior y Siguiente con el paso al que llevan", () => {
    expect(html).toContain("Anterior");
    expect(html).toContain("Siguiente: Extra");
  });

  test("con el siguiente bloqueado, Siguiente queda deshabilitado con el motivo a la vista", () => {
    const enExtra = pintar("extra");
    expect(enExtra).toMatch(/aria-disabled="true" aria-describedby="[^"]+">Siguiente: Coste/);
    expect(enExtra).toMatch(/<p id="[^"]+" class="[^"]*">Describe antes la escena\.<\/p>/);
  });

  test("en el primer paso no hay Anterior y en el último no hay Siguiente", () => {
    expect(pintar("origen")).not.toContain("Anterior");
    const abiertos = PASOS.slice(0, 3);
    expect(pintar("extra", abiertos)).not.toContain("Siguiente");
  });
});
