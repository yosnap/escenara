import { describe, expect, test } from "bun:test";
import { leerArgumentosRecurso, type RecursoDeCuenta, recursosDelTutorial } from "./tutorial-recurso";

/** El reinicio del producto o el lugar de un tutorial, sin base de datos. */
describe("argumentos del reinicio de un recurso", () => {
  test("acepta producto, lugar o los dos en una cuenta reservada", () => {
    expect(leerArgumentosRecurso(["--cuenta", "Tutoriales@Escenara.test", "--producto", "Botella Ondina"])).toEqual({
      cuenta: "tutoriales@escenara.test",
      producto: "Botella Ondina",
      lugar: null,
    });
    expect(leerArgumentosRecurso(["--cuenta", "tutoriales@escenara.test", "--lugar", "Terraza Mirto"])).toEqual({
      cuenta: "tutoriales@escenara.test",
      producto: null,
      lugar: "Terraza Mirto",
    });
    const ambos = leerArgumentosRecurso(["--cuenta", "a@b.test", "--producto", "P", "--lugar", "L"]);
    expect([ambos.producto, ambos.lugar]).toEqual(["P", "L"]);
  });

  test("rechaza lo que no es seguro o está incompleto", () => {
    expect(() => leerArgumentosRecurso(["--cuenta", "tutoriales@escenara.test"])).toThrow("--producto o --lugar");
    expect(() => leerArgumentosRecurso(["--cuenta", "ana@gmail.com", "--producto", "P"])).toThrow("dominio reservado");
    expect(() => leerArgumentosRecurso(["--producto", "P"])).toThrow("--cuenta");
    expect(() => leerArgumentosRecurso(["--cuenta", "a@b.test", "--lugar"])).toThrow("necesita un valor");
    // Las opciones del reinicio de personajes no valen aquí: este script nunca borra personajes.
    expect(() => leerArgumentosRecurso(["--cuenta", "a@b.test", "--nombre", "Brisa"])).toThrow("Opción desconocida");
    expect(() => leerArgumentosRecurso(["--cuenta", "a@b.test", "--producto", "P", "--mascota", "Lupo"])).toThrow(
      "Opción desconocida",
    );
  });
});

describe("recursos que se borran", () => {
  const filas: RecursoDeCuenta[] = [
    { id: "1", ownerId: "u", name: "Botella Ondina" },
    { id: "2", ownerId: "u", name: " Botella Ondina " },
    { id: "3", ownerId: "u", name: "Botella Ondina 2" },
    { id: "4", ownerId: "u", name: "botella ondina" },
    { id: "5", ownerId: "otra", name: "Botella Ondina" },
  ];

  test("solo los de la cuenta con el nombre exacto", () => {
    expect(recursosDelTutorial(filas, "u", "Botella Ondina").map((r) => r.id)).toEqual(["1", "2"]);
  });

  test("ningún otro recurso de la cuenta", () => {
    expect(recursosDelTutorial(filas, "u", "Terraza Mirto")).toEqual([]);
    expect(recursosDelTutorial(filas, "nadie", "Botella Ondina")).toEqual([]);
  });
});
