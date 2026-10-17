import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { confianzaDePersona, crearDetector } from "./personas";

/**
 * El detector que impide que una persona se cuele como animal, con el modelo real y sin red. Las dos fotos de prueba
 * son generadas con IA: una persona que no existe y un perro de frente, que es justo lo que un detector de caras
 * confunde con una cara humana.
 */
const fixture = async (nombre: string) =>
  new Uint8Array(await readFile(path.join(import.meta.dirname, "fixtures", nombre)));

const FILAS = 3549;

describe("detector de personas", () => {
  const detector = crearDetector();

  test("ve a la persona de una foto", async () => {
    expect(await detector.buscar(await fixture("persona-generada.jpg"))).toBe("persona");
    expect(detector.fallo()).toBeNull();
  });

  test("no confunde la cara de un perro de frente con una persona", async () => {
    expect(await detector.buscar(await fixture("perro-de-frente.jpg"))).toBe("sin_persona");
  });

  test("si el modelo no carga, no da la foto por comprobada y dice por qué", async () => {
    const roto = crearDetector(async () => {
      throw new Error("no se encuentra el modelo");
    });
    expect(await roto.buscar(await fixture("perro-de-frente.jpg"))).toBe("sin_comprobar");
    expect(roto.fallo()).toContain("no se encuentra el modelo");
  });

  test("una imagen que no se puede leer tampoco se da por comprobada", async () => {
    expect(await detector.buscar(new Uint8Array([1, 2, 3]))).toBe("sin_comprobar");
  });

  test("la confianza es la del mejor «person» (objeto × clase) y rechaza una salida de otra forma", () => {
    const salida = new Float32Array(FILAS * 85);
    salida[10 * 85 + 4] = 0.9;
    salida[10 * 85 + 5] = 0.5;
    salida[20 * 85 + 4] = 0.99;
    salida[20 * 85 + 5 + 16] = 0.99; // un perro muy claro no cuenta como persona
    expect(confianzaDePersona(salida, FILAS)).toBeCloseTo(0.45);
    expect(() => confianzaDePersona(salida, 100)).toThrow("Salida inesperada");
  });
});
