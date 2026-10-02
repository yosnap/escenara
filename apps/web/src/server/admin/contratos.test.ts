import { describe, expect, test } from "bun:test";
import { leerEleccionOpcional, permiteServicio, revocarOpcionales } from "@/lib/consentimiento";
import { resolverLimite, validarLimite } from "../presupuesto/limites-efectivos";
import { validarOperacion } from "./auditoria";
import { intervalo, pagina, usuarioFiltro } from "./filtros";

describe("contratos administrativos", () => {
  test("herencia, global cero y override explícito", () => {
    expect(resolverLimite(0)).toBeNull();
    expect(resolverLimite(25)).toBe(25);
    expect(resolverLimite(25, "sin-tope")).toBeNull();
    expect(resolverLimite(0, "limite", 12)).toBe(12);
    for (const n of [-1, 0, Number.NaN, Number.POSITIVE_INFINITY]) expect(() => validarLimite("limite", n)).toThrow();
    expect(() => validarLimite("heredar", 4)).toThrow();
    expect(() => validarLimite("otro", null)).toThrow();
  });
  test("fechas UTC reales, fin exclusivo y máximos", () => {
    const fechas = intervalo({ desde: "2026-09-01", hasta: "2026-10-01" });
    expect(fechas.inicio.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(fechas.fin.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    for (const p of [
      { desde: "2026-02-30" },
      { desde: "2026-10-02", hasta: "2026-10-01" },
      { desde: "2024-01-01", hasta: "2026-10-01" },
      { hasta: ["2026-10-01"] },
    ])
      expect(() => intervalo(p)).toThrow();
  });
  test("parámetros acotados y motivo", () => {
    expect(pagina({})).toBe(1);
    expect(pagina({ pagina: "25" })).toBe(25);
    for (const p of ["0", "-1", "1.1", "999999", "NaN"]) expect(() => pagina({ pagina: p })).toThrow();
    expect(() => usuarioFiltro({ usuario: "inyeccion" })).toThrow();
    expect(() => validarOperacion(crypto.randomUUID(), "", crypto.randomUUID())).toThrow();
  });
  test("sin integración ni almacenamiento no se autoriza analítica", () => {
    expect(permiteServicio("tracker", true, { version: "sin-servicios-v1", aceptados: ["tracker"] })).toBe(false);
    expect(permiteServicio("tracker", true, "Entendido")).toBe(false);
    const roto = {
      getItem() {
        throw new Error("Privado");
      },
      removeItem() {
        throw new Error("Privado");
      },
    };
    expect(leerEleccionOpcional(roto)).toBeNull();
    expect(() => revocarOpcionales(roto)).not.toThrow();
  });
});
