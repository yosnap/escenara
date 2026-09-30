import { describe, expect, test } from "bun:test";
import {
  direccionConPaso,
  esNavegable,
  type PasoDelFlujo,
  pasoDeLaUrl,
  resolverPaso,
  vecino,
  visitadosAlAbrir,
} from "./multipaso";

const paso = (id: string, estado: PasoDelFlujo["estado"], motivo?: string): PasoDelFlujo => ({
  id,
  titulo: id,
  corto: id,
  estado,
  ...(motivo ? { motivo } : {}),
});

const PASOS = [paso("a", "hecho"), paso("b", "pendiente"), paso("c", "pendiente"), paso("d", "bloqueado", "Falta c.")];
const IDS = PASOS.map((p) => p.id);

describe("paso pedido en la dirección", () => {
  test("acepta solo un paso de este flujo", () => {
    expect(pasoDeLaUrl("b", IDS)).toBe("b");
    expect(pasoDeLaUrl(" B ", IDS)).toBe("b");
    expect(pasoDeLaUrl("z", IDS)).toBeNull();
    expect(pasoDeLaUrl("", IDS)).toBeNull();
    expect(pasoDeLaUrl(undefined, IDS)).toBeNull();
    expect(pasoDeLaUrl(null, IDS)).toBeNull();
  });

  test("un parámetro repetido o con caracteres raros no cuenta como pedido", () => {
    expect(pasoDeLaUrl(["a", "b"], IDS)).toBeNull();
    expect(pasoDeLaUrl("a<script>", IDS)).toBeNull();
    expect(pasoDeLaUrl("x".repeat(200), IDS)).toBeNull();
  });
});

describe("paso con el que se abre", () => {
  test("el pedido manda si se puede abrir", () => {
    expect(resolverPaso("c", PASOS, "a")).toBe("c");
  });

  test("un pedido bloqueado o inexistente abre el predeterminado", () => {
    expect(resolverPaso("d", PASOS, "a")).toBe("a");
    expect(resolverPaso(null, PASOS, "b")).toBe("b");
  });

  test("un predeterminado que no está en la lista abre el primero", () => {
    expect(resolverPaso(null, PASOS, "z")).toBe("a");
  });
});

describe("navegación libre", () => {
  test("al abrir en un paso, los anteriores cuentan como visitados", () => {
    expect(visitadosAlAbrir(PASOS, "c")).toEqual(["a", "b", "c"]);
    expect(visitadosAlAbrir(PASOS, "a")).toEqual(["a"]);
    expect(visitadosAlAbrir(PASOS, "z")).toEqual(["a"]);
  });

  test("se salta a lo hecho o visitado, nunca a lo bloqueado", () => {
    expect(esNavegable(paso("a", "hecho"), [])).toBe(true);
    expect(esNavegable(paso("b", "pendiente"), [])).toBe(false);
    expect(esNavegable(paso("b", "pendiente"), ["b"])).toBe(true);
    expect(esNavegable(paso("d", "bloqueado"), ["d"])).toBe(false);
  });

  test("anterior y siguiente, y nada en los extremos", () => {
    expect(vecino(PASOS, "b", 1)?.id).toBe("c");
    expect(vecino(PASOS, "b", -1)?.id).toBe("a");
    expect(vecino(PASOS, "a", -1)).toBeNull();
    expect(vecino(PASOS, "d", 1)).toBeNull();
    expect(vecino(PASOS, "z", 1)).toBeNull();
  });
});

describe("?paso= en la dirección", () => {
  test("se añade sin tocar los demás parámetros de «Crear»", () => {
    expect(direccionConPaso("https://app.escenara.com/crear?personaje=p1", "escena")).toBe(
      "/crear?personaje=p1&paso=escena",
    );
  });

  test("sustituye el paso anterior y conserva el ancla", () => {
    expect(direccionConPaso("/proyectos/x?paso=idea#arriba", "escenas")).toBe("/proyectos/x?paso=escenas#arriba");
  });
});
