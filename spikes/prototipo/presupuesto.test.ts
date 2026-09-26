import { describe, expect, it } from "bun:test";
import { gastado, puedeLanzar, type Registro } from "./presupuesto";

const base = (movimientos: Registro["movimientos"]): Registro => ({ topeUsd: 0.5, movimientos });
const mov = (estimadoUsd: number, realUsd: number | null) => ({
  paso: "p",
  proveedor: "kie" as const,
  modelo: "m",
  estimadoUsd,
  realUsd,
  fuenteReal: "",
  fecha: "",
});

describe("presupuesto", () => {
  it("usa el coste real cuando existe y la estimación cuando no", () => {
    expect(gastado(base([mov(0.1, 0.02), mov(0.2, null)]))).toBeCloseTo(0.22);
  });

  it("permite lanzar si cabe exactamente en el tope", () => {
    expect(puedeLanzar(base([mov(0.3, 0.3)]), 0.2).ok).toBe(true);
  });

  it("bloquea si la estimación supera lo que queda", () => {
    const r = puedeLanzar(base([mov(0.3, 0.3)]), 0.21);
    expect(r.ok).toBe(false);
    expect(r.restante).toBeCloseTo(0.2);
  });
});
