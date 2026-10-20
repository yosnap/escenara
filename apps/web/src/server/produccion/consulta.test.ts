import { describe, expect, test } from "bun:test";
import { impedimentoDeDuracionOmni, impedimentosDeProduccion } from "./consulta";

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

/**
 * En modo Omni la duración se juzga contra el modelo de escenas habladas, que es el que genera la escena. Antes se
 * miraba Veo 3.1 Fast (4 u 8 s) y un proyecto de 6 s con Gemini Omni se ofrecía y luego se rechazaba al producir.
 */
describe("duración de un proyecto en modo Omni", () => {
  const omni = { nombre: "Gemini Omni 1.1 Flash", duraciones: [4, 6, 8, 10] };

  test("6 s se producen si el modelo Omni los admite, aunque Veo no", () => {
    expect(impedimentoDeDuracionOmni(omni, 6)).toBeNull();
  });

  test("una duración que el modelo Omni no cobra se rechaza diciendo que es el de escenas habladas, sin nombrarlo", () => {
    const motivo = impedimentoDeDuracionOmni({ nombre: "Gemini Omni 1.1 Flash", duraciones: [4] }, 6);
    expect(motivo).toContain("el modelo de voz e identidad registradas que usas");
    expect(motivo).not.toContain("Gemini");
    expect(motivo).toContain("solo genera de 4 s");
    expect(motivo).not.toContain("modelo de animación");
  });
});
