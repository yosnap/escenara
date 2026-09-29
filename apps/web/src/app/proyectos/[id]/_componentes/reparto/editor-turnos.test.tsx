import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { MiembroReparto } from "@/lib/reparto";
import { EditorTurnos } from "./editor-turnos";

/** Los turnos del diálogo se ordenan arrastrando o con el teclado; Subir y Bajar siguen como alternativa. */

const miembro = (id: string, nombre: string, orden: number): MiembroReparto => ({
  id: `m-${id}`,
  personajeId: id,
  nombre,
  inventado: true,
  papel: "hablante",
  lado: "izquierda",
  mirada: "camara",
  orden,
});

const html = renderToStaticMarkup(
  <EditorTurnos
    miembros={[miembro("a", "Elisa", 1), miembro("b", "Marcos", 2)]}
    formato="dualcast"
    turnos={[
      { personajeId: "a", texto: "Hola", direccion: "" },
      { personajeId: "b", texto: "Buenas", direccion: "en tono cercano" },
    ]}
    segundos={8}
    deshabilitado={false}
    guardando={false}
    onGuardar={() => {}}
  />,
);

describe("editor de turnos del diálogo", () => {
  test("cada turno tiene su asa enfocable con nombre", () => {
    expect(html).toContain('aria-label="Cambiar el orden de turno 1"');
    expect(html).toContain('aria-label="Cambiar el orden de turno 2"');
  });

  test("dice cómo se coge y se suelta con el teclado", () => {
    expect(html).toContain("Espacio para coger");
  });

  test("Subir y Bajar siguen disponibles", () => {
    expect(html).toContain('aria-label="Subir el turno 2"');
    expect(html).toContain('aria-label="Bajar el turno 1"');
  });
});
