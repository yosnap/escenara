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
  test("ya no afirma que ninguna comprobación decide nada", () => {
    const html = pintar([]);
    expect(html).not.toContain("no deciden nada");
    expect(html).toContain("únicamente la de <strong>parecido</strong> decide de verdad");
  });

  test("una comprobación en sombra dice que informa y no decide", () => {
    expect(pintar([decision({ modo: "sombra" })])).toContain("En sombra: informa y no decide nada.");
  });

  test("el parecido en Activa dice que decide de verdad", () => {
    const html = pintar([decision({ comprobacion: "identidad", modo: "activa", nombre: "Es la misma persona" })]);
    expect(html).toContain("Activa: decide de verdad");
  });

  test("otra comprobación en Activa todavía solo informa", () => {
    const html = pintar([decision({ comprobacion: "guion", modo: "activa" })]);
    expect(html).toContain("todavía solo informa");
    expect(html).not.toContain("Activa: decide de verdad");
  });
});
