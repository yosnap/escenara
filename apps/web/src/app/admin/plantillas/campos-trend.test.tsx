import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CampoDireccionDecidida, CampoDuracionesAdmitidas, leerDuracionesEscritas } from "./campos-trend";

/** Los dos campos del diálogo de un trend que dicen qué decide él, comprobados sobre el HTML que se pinta. */
describe("campos del trend en Admin › Plantillas", () => {
  test("«La dirección decide» es un grupo de casillas con su ayuda, sin desplegable nativo", () => {
    const html = renderToStaticMarkup(<CampoDireccionDecidida valor={["plano", "camara"]} onCambio={() => {}} />);
    expect(html).toContain("<fieldset");
    expect(html).toContain("La dirección decide");
    expect(html).toContain("Lo decide el trend");
    expect(html).not.toContain("<select");
    for (const etiqueta of ["Plano", "Ángulo", "Movimiento de cámara", "Micro-acción", "Registro estético"]) {
      expect(html).toContain(etiqueta);
    }
    // Dos marcadas de cinco.
    expect(html.match(/aria-checked="true"/g) ?? []).toHaveLength(2);
    expect(html.match(/aria-checked="false"/g) ?? []).toHaveLength(3);
  });

  test("«Duraciones admitidas» explica que vacío es cualquiera y cita la duración histórica", () => {
    const html = renderToStaticMarkup(<CampoDuracionesAdmitidas valor="" disenada={8} onCambio={() => {}} />);
    expect(html).toContain("Duraciones admitidas (s)");
    expect(html).toContain("Vacío = cualquier duración");
    expect(html).toContain("Se diseñó para 8 s: es solo un dato histórico y ya no limita nada.");
    const nueva = renderToStaticMarkup(<CampoDuracionesAdmitidas valor="5, 8" disenada={null} onCambio={() => {}} />);
    expect(nueva).not.toContain("Se diseñó");
    expect(nueva).toContain('value="5, 8"');
  });

  test("lo escrito se lee como segundos o se rechaza con la causa", () => {
    expect(leerDuracionesEscritas("")).toEqual({ duraciones: [] });
    expect(leerDuracionesEscritas(" 5, 8 ,")).toEqual({ duraciones: [5, 8] });
    expect(leerDuracionesEscritas("5, ocho")).toEqual({
      error: "«ocho» no es un número de segundos: escribe enteros separados por comas, como «5, 8».",
    });
    expect("error" in leerDuracionesEscritas("4.5")).toBe(true);
  });
});
