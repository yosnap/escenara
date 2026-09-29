import { describe, expect, test } from "bun:test";
import { impedimentosDeProduccion } from "./consulta";

describe("impedimentos generales de producción", () => {
  const proyecto = {
    planAprobado: true,
    protagonista: "personaje-propio",
    sinPrecio: true,
    segundosDelClip: 6,
    segundosDelProyecto: 8,
    presupuesto: 200,
    comprometido: 0,
    creditosFotograma: 0,
    porProducir: 0,
    tieneEscenasNormales: false,
  };

  test("el modelo de animación normal no bloquea un proyecto que solo tiene canto", () => {
    expect(impedimentosDeProduccion(proyecto)).toEqual([]);
  });

  test("si queda una escena normal, avisa de su precio y duración incompatible", () => {
    const impedimentos = impedimentosDeProduccion({ ...proyecto, porProducir: 1, tieneEscenasNormales: true });
    expect(impedimentos).toHaveLength(2);
    expect(impedimentos.join(" ")).toContain("modelo");
    expect(impedimentos.join(" ")).toContain("duración");
  });
});
