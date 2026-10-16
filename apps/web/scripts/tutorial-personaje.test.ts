import { describe, expect, test } from "bun:test";
import {
  leerArgumentosReinicio,
  motivoParaNoReiniciar,
  type PersonajeDeCuenta,
  personajesDelTutorial,
  resumenTrabajos,
} from "./tutorial-personaje";

/** El reinicio de la cuenta de tutoriales, sin base de datos: qué cuentas se aceptan y qué personajes se borran. */
describe("argumentos del reinicio", () => {
  test("exige cuenta de un dominio reservado y nombre", () => {
    expect(leerArgumentosReinicio(["--cuenta", "Tutoriales@Escenara.test", "--nombre", "Brisa"])).toEqual({
      cuenta: "tutoriales@escenara.test",
      nombre: "Brisa",
    });
    expect(() => leerArgumentosReinicio(["--nombre", "Brisa"])).toThrow("--cuenta");
    expect(() => leerArgumentosReinicio(["--cuenta", "ana@gmail.com", "--nombre", "Brisa"])).toThrow(
      "dominio reservado",
    );
    expect(() => leerArgumentosReinicio(["--cuenta", "demo@example.com"])).toThrow("--nombre");
    expect(() => leerArgumentosReinicio(["--cuenta", "--nombre", "Brisa"])).toThrow("necesita un valor");
    expect(() => leerArgumentosReinicio(["--cuenta", "a@b.test", "--nombre", "B", "--todo"])).toThrow(
      "Opción desconocida",
    );
  });
});

describe("cuenta que se puede reiniciar", () => {
  test("solo una cuenta normal de un dominio reservado", () => {
    expect(motivoParaNoReiniciar({ id: "u", email: "tutoriales@escenara.test", role: "user" })).toBeNull();
    expect(motivoParaNoReiniciar(null)).toContain("No existe");
    expect(motivoParaNoReiniciar({ id: "u", email: "demos@escenara.test", role: "admin" })).toContain("administración");
    expect(motivoParaNoReiniciar({ id: "u", email: "ana@empresa.es", role: "user" })).toContain("dominio reservado");
  });
});

describe("personajes que se borran", () => {
  const cuenta = "cuenta-tutoriales";
  const p = (datos: Partial<PersonajeDeCuenta>): PersonajeDeCuenta => ({
    id: "x",
    ownerId: cuenta,
    name: "Brisa",
    virtual: true,
    ...datos,
  });

  test("solo los inventados de la cuenta con el nombre exacto", () => {
    const lista = [
      p({ id: "a" }),
      p({ id: "b", name: " Brisa " }),
      p({ id: "real", virtual: false }),
      p({ id: "otra-cuenta", ownerId: "otra" }),
      p({ id: "otro-nombre", name: "Elisa" }),
      p({ id: "parecido", name: "brisa" }),
    ];
    expect(personajesDelTutorial(lista, cuenta, "Brisa").map((x) => x.id)).toEqual(["a", "b"]);
  });
});

describe("resumen del gasto", () => {
  test("suma estimados y consumidos y agrupa por tipo y estado", () => {
    expect(resumenTrabajos([])).toBe("sin trabajos");
    expect(
      resumenTrabajos([
        { kind: "fotograma", state: "listo", estimatedCredits: 6, consumedCredits: 4 },
        { kind: "fotograma", state: "listo", estimatedCredits: 6, consumedCredits: 4 },
        { kind: "fotograma", state: "fallido", estimatedCredits: 6, consumedCredits: null },
      ]),
    ).toBe("3 trabajos (2 fotograma/listo, 1 fotograma/fallido); créditos estimados 18, consumidos 8");
  });
});
