import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { DecisionVista } from "@/lib/coherencia";
import { PanelCoherencia } from "./panel-coherencia";

/**
 * El panel de coherencia dice **la verdad de cada modo**: en sombra informa, en Activa solo decide el parecido
 * y las demás siguen solo informando.
 */

const decision = (parcial: Partial<DecisionVista>): DecisionVista => ({
  id: "d1",
  comprobacion: "guion",
  nombre: "La escena cubre el guion",
  modo: "sombra",
  veredicto: "pasa",
  evidencia: "Encaja.",
  confianza: 0.9,
  umbral: 0.75,
  modeloDecision: "jev",
  modeloPercepcion: "",
  correccion: null,
  fecha: "2026-09-30T10:00:00.000Z",
  ...parcial,
});

const pintar = (decisiones: DecisionVista[]) =>
  renderToStaticMarkup(
    <PanelCoherencia decisiones={decisiones} ocupado={false} onComprobar={() => {}} onCorregir={() => {}} />,
  );

describe("panel de coherencia de la escena", () => {
  test("no afirma que ninguna decida nada de forma genérica y dice dónde decide el parecido", () => {
    const html = pintar([]);
    expect(html).not.toContain("no deciden nada");
    expect(html).toContain("<strong>ninguna</strong>");
    expect(html).toContain("solo decide en la ficha del personaje");
  });

  test("una comprobación en sombra, en la escena, solo informa", () => {
    expect(pintar([decision({ modo: "sombra" })])).toContain("Aquí solo informa");
  });

  test("el parecido en Activa, en la escena, no dice que decida la cobertura: solo informa", () => {
    const html = pintar([decision({ comprobacion: "identidad", modo: "activa", nombre: "Es la misma persona" })]);
    expect(html).toContain("Aquí solo informa");
    expect(html).not.toContain("Activa: decide la cobertura");
  });

  test("otra comprobación en Activa también solo informa en la escena", () => {
    const html = pintar([decision({ comprobacion: "guion", modo: "activa" })]);
    expect(html).toContain("Aquí solo informa");
    expect(html).not.toContain("decide la cobertura");
  });
});
