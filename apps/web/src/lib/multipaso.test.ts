import { describe, expect, test } from "bun:test";
import {
  avisoVigente,
  direccionConPaso,
  escribirPasoEnLaDireccion,
  estadoInicialMultipaso,
  esNavegable,
  motivoNoNavegable,
  NO_ALCANZADO,
  reducirMultipaso,
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

  test("nunca abre un paso bloqueado, tampoco el predeterminado", () => {
    expect(resolverPaso(null, PASOS, "d")).toBe("a");
    const primeroBloqueado = [paso("x", "bloqueado", "No."), ...PASOS];
    expect(resolverPaso("x", primeroBloqueado, "x")).toBe("a");
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

describe("aviso de un paso que no se abre", () => {
  const inicio = estadoInicialMultipaso(PASOS, "b");

  test("bloqueado dice su motivo; sin alcanzar dice que se avanza con Siguiente; lo abrible no dice nada", () => {
    expect(motivoNoNavegable(PASOS[3] as PasoDelFlujo, [])).toBe("Falta c.");
    expect(motivoNoNavegable(PASOS[2] as PasoDelFlujo, ["a", "b"])).toBe(NO_ALCANZADO);
    expect(motivoNoNavegable(PASOS[1] as PasoDelFlujo, ["a", "b"])).toBeNull();
  });

  test("pulsar un bloqueado enseña su motivo y cambiar de paso lo retira", () => {
    const avisado = reducirMultipaso(inicio, { tipo: "avisar", id: "d" });
    expect(avisoVigente(avisado, PASOS)?.motivo).toBe("Falta c.");
    const despues = reducirMultipaso(avisado, { tipo: "ir", id: "c" });
    expect(despues.avisoDe).toBeNull();
    expect(despues.actual).toBe("c");
    expect(despues.visitados).toEqual(["a", "b", "c"]);
    expect(despues.enfocar).toBe(true);
  });

  test("saltar solo a otro paso (por ejemplo, tras confirmar un gasto) también lo retira", () => {
    const avisado = reducirMultipaso(inicio, { tipo: "avisar", id: "d" });
    expect(reducirMultipaso(avisado, { tipo: "ir", id: "a" }).avisoDe).toBeNull();
  });

  test("si el paso se desbloquea, el aviso deja de enseñarse aunque siga guardado", () => {
    const avisado = reducirMultipaso(inicio, { tipo: "avisar", id: "d" });
    const desbloqueados = PASOS.map((p) => (p.id === "d" ? { ...p, estado: "hecho" as const } : p));
    expect(avisoVigente(avisado, desbloqueados)).toBeNull();
  });

  test("al abrir no se mueve el foco", () => {
    expect(inicio.enfocar).toBe(false);
    expect(inicio.avisoDe).toBeNull();
  });
});

describe("escribir el paso en la dirección", () => {
  test("cambia ?paso= sin perder ?personaje= y sin añadir entradas al historial", () => {
    const llamadas: string[] = [];
    const ventana = {
      location: { href: "http://localhost/crear?personaje=p1&paso=formato" },
      history: { replaceState: (_d: null, _t: string, url: string) => void llamadas.push(url) },
    };
    escribirPasoEnLaDireccion("escena", ventana);
    expect(llamadas).toEqual(["/crear?personaje=p1&paso=escena"]);
  });
});
