import { describe, expect, test } from "bun:test";
import type { ModeloElegible } from "@/lib/catalogo";
import type { Estimacion } from "@/lib/generacion";
import type { PlantillaVisible } from "@/lib/presets";
import {
  aplicarFormato,
  crearSecuencia,
  type EntradaDeFormato,
  type MemoriaDeModelo,
  type SalidaDeFormato,
} from "./orquestar-formato";

/**
 * Elegir formato en «Crear» con estimaciones simuladas: cambio automático de modelo, vuelta atrás al quitar el trend,
 * respeto al modelo elegido a mano y respuestas fuera de orden.
 */
const modelo = (id: string, segundos: number[]): ModeloElegible => ({
  modelo: id,
  nombre: id.toUpperCase(),
  conVoz: true,
  unidad: "vídeo",
  estado: "validado",
  creditos: 10,
  precioPublicado: false,
  duracionesConCoste: segundos.map((s) => ({ segundos: s, creditos: 10, unidad: `clip de ${s} s`, publicado: false })),
  duraciones: segundos,
  maximoReferencias: 1,
});
const FAST = modelo("fast", [4, 8]);
const PRO = modelo("pro", [4, 6, 8]);
const trend = (id: string, segundos: number, permitidos: string[] = []): PlantillaVisible =>
  ({
    id,
    nombre: `Trend ${id}`,
    kind: "trend",
    duracionesAdmitidas: [segundos],
    modelosPermitidos: permitidos,
  }) as unknown as PlantillaVisible;

const estimacion = (m: string) => ({ modelo: m, sello: `sello-${m}` }) as unknown as Estimacion;

function entrada(extra: Partial<EntradaDeFormato> = {}): EntradaDeFormato & { avisosDeCalculo: boolean[] } {
  const avisosDeCalculo: boolean[] = [];
  return {
    secuencia: crearSecuencia(),
    trend: trend("a", 6),
    modeloActual: FAST,
    modeloActualId: "fast",
    candidatos: [FAST, PRO],
    predeterminado: "fast",
    memoria: null,
    avisoActual: null,
    estimar: async (m) => ({ ok: true, datos: estimacion(m) }),
    calculando: (v) => avisosDeCalculo.push(v),
    avisosDeCalculo,
    ...extra,
  };
}

const listo = (s: SalidaDeFormato | null) => {
  expect(s?.tipo).toBe("listo");
  if (s?.tipo !== "listo") throw new Error("se esperaba un resultado listo");
  return s;
};

describe("cambio de modelo al elegir un trend", () => {
  test("sin tarifa para la duración cambia, estima con el modelo nuevo y lo recuerda", async () => {
    const e = entrada();
    const s = listo(await aplicarFormato(e));
    expect(s.modelo).toBe("pro");
    expect(s.modeloCambiado).toBe(true);
    expect(s.estimacion.modelo).toBe("pro");
    expect(s.aviso).toContain("Hemos cambiado a PRO porque FAST no tiene clips de 6 s");
    expect(s.memoria).toEqual({ anterior: "fast", automatico: "pro" });
    expect(e.avisosDeCalculo).toEqual([true, false]);
  });

  test("si el trend no admite el modelo actual, cambia aunque tenga tarifa", async () => {
    const s = listo(await aplicarFormato(entrada({ trend: trend("a", 4, ["pro"]) })));
    expect(s.modelo).toBe("pro");
    expect(s.aviso).toContain("el trend no admite FAST");
  });

  test("si el modelo sirve, no se toca y no hay aviso", async () => {
    const s = listo(await aplicarFormato(entrada({ trend: trend("a", 4) })));
    expect(s.modeloCambiado).toBe(false);
    expect(s.aviso).toBeNull();
    expect(s.memoria).toBeNull();
  });

  test("sin ningún modelo compatible: error con la causa, sin estimar y sin dejar el cálculo en marcha", async () => {
    let estimaciones = 0;
    const e = entrada({
      candidatos: [FAST],
      estimar: async (m) => {
        estimaciones++;
        return { ok: true, datos: estimacion(m) };
      },
    });
    const s = await aplicarFormato(e);
    expect(s?.tipo === "error" && s.error).toContain("no hay ninguno disponible");
    expect(estimaciones).toBe(0);
    expect(e.avisosDeCalculo.at(-1)).toBe(false);
  });

  test("si la estimación falla, es un error y no se aplica nada", async () => {
    const s = await aplicarFormato(entrada({ estimar: async () => ({ ok: false, error: "sin conexión" }) }));
    expect(s).toEqual({ tipo: "error", error: "sin conexión" });
  });
});

describe("quitar el trend", () => {
  const memoria: MemoriaDeModelo = { anterior: "fast", automatico: "pro" };
  const sinTrend = { trend: null, modeloActual: PRO, modeloActualId: "pro", memoria, avisoActual: "aviso" };

  test("vuelve al modelo que la persona tenía antes del cambio automático y lo dice", async () => {
    const s = listo(await aplicarFormato(entrada(sinTrend)));
    expect(s.modelo).toBe("fast");
    expect(s.estimacion.modelo).toBe("fast");
    expect(s.modeloCambiado).toBe(true);
    expect(s.aviso).toBe("Hemos vuelto a FAST, el modelo que tenías antes de elegir el trend.");
    expect(s.memoria).toBeNull();
  });

  test("si la persona eligió otro modelo a mano después del cambio, no se lo pisa y retira el aviso", async () => {
    const s = listo(await aplicarFormato(entrada({ ...sinTrend, modeloActual: FAST, modeloActualId: "fast" })));
    expect(s.modelo).toBe("fast");
    expect(s.modeloCambiado).toBe(false);
    expect(s.aviso).toBeNull();
    expect(s.memoria).toBeNull();
  });

  test("sin cambio automático previo no toca el modelo", async () => {
    const s = listo(await aplicarFormato(entrada({ ...sinTrend, memoria: null, avisoActual: null })));
    expect(s.modelo).toBe("pro");
    expect(s.aviso).toBeNull();
  });

  test("si el modelo anterior ya no está disponible, se queda con el actual", async () => {
    const s = listo(await aplicarFormato(entrada({ ...sinTrend, candidatos: [PRO] })));
    expect(s.modelo).toBe("pro");
    expect(s.aviso).toBeNull();
  });

  test("de un trend a otro que sirve con el mismo modelo automático, conserva el aviso y el modelo original", async () => {
    const s = listo(
      await aplicarFormato(
        entrada({ trend: trend("b", 6), modeloActual: PRO, modeloActualId: "pro", memoria, avisoActual: "aviso" }),
      ),
    );
    expect(s.modelo).toBe("pro");
    expect(s.aviso).toBe("aviso");
    expect(s.memoria).toEqual(memoria);
  });

  test("de un trend a otro que obliga a otro cambio, recuerda el modelo ORIGINAL de la persona", async () => {
    const OTRO = modelo("otro", [10]);
    const s = listo(
      await aplicarFormato(
        entrada({
          trend: trend("b", 10),
          modeloActual: PRO,
          modeloActualId: "pro",
          candidatos: [FAST, PRO, OTRO],
          memoria,
        }),
      ),
    );
    expect(s.modelo).toBe("otro");
    expect(s.memoria).toEqual({ anterior: "fast", automatico: "otro" });
  });
});

describe("respuestas fuera de orden", () => {
  test("solo se aplica la última elección aunque la primera responda después", async () => {
    const secuencia = crearSecuencia();
    const pendientes = new Map<string, (r: { ok: true; datos: Estimacion }) => void>();
    const estimar = (m: string) =>
      new Promise<{ ok: true; datos: Estimacion }>((resolver) => pendientes.set(m, resolver));
    const primera = aplicarFormato(entrada({ secuencia, estimar, trend: trend("a", 6) })); // cambia a «pro»
    const segunda = aplicarFormato(entrada({ secuencia, estimar, trend: trend("b", 4) })); // se queda en «fast»
    pendientes.get("fast")?.({ ok: true, datos: estimacion("fast") });
    pendientes.get("pro")?.({ ok: true, datos: estimacion("pro") });
    expect(await primera).toBeNull();
    const s = listo(await segunda);
    expect(s.modelo).toBe("fast");
    expect(secuencia.vigente(s.token)).toBe(true);
  });

  test("si la primera responde antes, queda obsoleta en cuanto empieza la segunda", async () => {
    const secuencia = crearSecuencia();
    const primera = aplicarFormato(entrada({ secuencia, trend: trend("a", 6) }));
    const segunda = aplicarFormato(entrada({ secuencia, trend: trend("b", 4) }));
    expect(await primera).toBeNull();
    expect(listo(await segunda).modelo).toBe("fast");
  });

  test("un error de una elección obsoleta no se enseña", async () => {
    const secuencia = crearSecuencia();
    let fallar: (r: { ok: false; error: string }) => void = () => {};
    const lenta = aplicarFormato(entrada({ secuencia, estimar: () => new Promise((resolver) => (fallar = resolver)) }));
    const rapida = aplicarFormato(entrada({ secuencia, trend: trend("b", 4) }));
    fallar({ ok: false, error: "tarde" });
    expect(await lenta).toBeNull();
    expect((await rapida)?.tipo).toBe("listo");
  });
});
