import { describe, expect, test } from "bun:test";
import { DIRECCION_CON_ACENTO_VACIA } from "./direccion";
import {
  admiteDuracion,
  categoriasDecididasDe,
  duracionesDe,
  eleccionSinLoDecidido,
  motivoDecididaPorTrend,
  motivoDuracionNoAdmitida,
  segundosParaTrend,
  textoDeDuraciones,
} from "./trends";

describe("duraciones admitidas de un trend", () => {
  test("se leen ordenadas, sin repetir y descartando lo que no es una duración", () => {
    expect(duracionesDe('[8, 5, 8, 0, 601, 4.5, "6"]')).toEqual([5, 8]);
    expect(duracionesDe([6])).toEqual([6]);
    expect(duracionesDe("no es json")).toEqual([]);
    expect(duracionesDe({ segundos: 6 })).toEqual([]);
  });

  test("sin lista vale cualquier duración; con lista, solo las suyas", () => {
    expect(admiteDuracion([], 4)).toBe(true);
    expect(admiteDuracion([], null)).toBe(true);
    expect(admiteDuracion([5, 8], 8)).toBe(true);
    expect(admiteDuracion([5, 8], 6)).toBe(false);
    expect(admiteDuracion([5, 8], undefined)).toBe(false);
  });

  test("el texto de las duraciones se lee en castellano", () => {
    expect(textoDeDuraciones([])).toBe("cualquier duración");
    expect(textoDeDuraciones([6])).toBe("6 s");
    expect(textoDeDuraciones([4, 6, 8])).toBe("4, 6 o 8 s");
  });

  test("el rechazo dice qué admite el trend, qué se pidió y dónde cambiarlo", () => {
    const trend = { nombre: "Giro", duracionesAdmitidas: [5] };
    expect(motivoDuracionNoAdmitida(trend, 5)).toBeNull();
    expect(motivoDuracionNoAdmitida({ ...trend, duracionesAdmitidas: [] }, 12)).toBeNull();
    expect(motivoDuracionNoAdmitida(trend, 8)).toBe(
      "El trend «Giro» solo admite clips de 5 s y has pedido 8 s. Elige una de esas duraciones.",
    );
    expect(motivoDuracionNoAdmitida(trend, 8, "proyecto")).toContain("el proyecto está configurado a 8 s");
    expect(motivoDuracionNoAdmitida(trend, null)).toContain("elige una de esas duraciones");
  });

  test("la duración que se estima: la actual si vale, si no la primera admitida que el modelo cobra", () => {
    // Sin lista: se conserva la actual si el modelo la cobra; si no, manda la del modelo.
    expect(segundosParaTrend([], [4, 8], 8)).toBe(8);
    expect(segundosParaTrend([], [4, 8], 6)).toBeUndefined();
    expect(segundosParaTrend([], [], 6)).toBe(6);
    // Con lista.
    expect(segundosParaTrend([5, 8], [4, 8], 8)).toBe(8);
    expect(segundosParaTrend([5, 8], [4, 8], 4)).toBe(8);
    expect(segundosParaTrend([5, 8], [6], 6)).toBe(5);
    expect(segundosParaTrend([5, 8], [], undefined)).toBe(5);
  });
});

describe("lo que decide un trend de la dirección", () => {
  test("solo se aceptan las categorías que un trend puede decidir, en orden fijo", () => {
    expect(categoriasDecididasDe('["camara","plano","luz","camara","formato-clip"]')).toEqual(["plano", "camara"]);
    expect(categoriasDecididasDe(["registro-estetico", "microaccion", "angulo"])).toEqual([
      "angulo",
      "microaccion",
      "registro-estetico",
    ]);
    expect(categoriasDecididasDe("roto")).toEqual([]);
    expect(categoriasDecididasDe(null)).toEqual([]);
  });

  test("el motivo nombra el trend", () => {
    expect(motivoDecididaPorTrend("Unboxing")).toBe("Lo decide el trend «Unboxing»");
  });

  test("la elección sin lo decidido vacía esas claves y deja el resto intacto", () => {
    const elegida = {
      ...DIRECCION_CON_ACENTO_VACIA,
      plano: "primer-plano",
      angulo: "picado",
      camara: "orbita-lenta",
      microaccion: "sonreir",
      momentoMicroaccion: "despues" as const,
      luz: "ventana",
      instruccionesExtra: "Que se vea la etiqueta",
      acento: "es_MX_cdmx" as const,
    };
    const limpia = eleccionSinLoDecidido(elegida, ["plano", "camara", "microaccion"]);
    expect(limpia.plano).toBe("");
    expect(limpia.camara).toBe("");
    expect(limpia.microaccion).toBe("");
    expect(limpia.momentoMicroaccion).toBe("durante");
    expect(limpia.angulo).toBe("picado");
    expect(limpia.luz).toBe("ventana");
    expect(limpia.instruccionesExtra).toBe("Que se vea la etiqueta");
    expect(limpia.acento).toBe("es_MX_cdmx");
    expect(eleccionSinLoDecidido(elegida, [])).toBe(elegida);
  });
});
