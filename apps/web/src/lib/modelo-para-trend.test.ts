import { describe, expect, test } from "bun:test";
import type { ModeloElegible } from "./catalogo";
import { decidirModeloParaTrend, motivoSinDuracion, tieneTarifaParaDuracion } from "./modelo-para-trend";

const modelo = (id: string, segundos: number[], extra: Partial<ModeloElegible> = {}): ModeloElegible => ({
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
  ...extra,
});

const FAST = modelo("veo-fast", [4, 8]);
const PRO = modelo("veo-pro", [4, 6, 8]);
const MUDO = modelo("mudo", [6], { conVoz: false });
const TREND = { nombre: "Unboxing", duracionesAdmitidas: [6], modelosPermitidos: [] as string[] };

describe("tarifa por duración", () => {
  test("con duraciones registradas hace falta la de la pedida", () => {
    expect(tieneTarifaParaDuracion(FAST, 8)).toBe(true);
    expect(tieneTarifaParaDuracion(FAST, 6)).toBe(false);
  });

  test("sin ninguna duración registrada no hay tarifa por duración que exigir", () => {
    expect(tieneTarifaParaDuracion(modelo("libre", []), 6)).toBe(true);
  });

  test("el motivo dice qué duraciones sí tiene", () => {
    expect(motivoSinDuracion(FAST, 6)).toBe("VEO-FAST no tiene clips de 6 s (solo 4 y 8 s).");
    expect(motivoSinDuracion(PRO, 6)).toBeNull();
    expect(motivoSinDuracion(PRO, 5)).toBe("VEO-PRO no tiene clips de 5 s (solo 4, 6 y 8 s).");
  });
});

describe("modelo al elegir un trend", () => {
  const base = { actual: FAST, candidatos: [FAST, PRO, MUDO], trend: TREND, predeterminado: "veo-fast" };

  test("si el actual ya cobra la duración, no se toca", () => {
    expect(decidirModeloParaTrend({ ...base, actual: PRO })).toEqual({ tipo: "mantener" });
  });

  test("sin trend o sin duraciones admitidas no hay nada que decidir", () => {
    expect(decidirModeloParaTrend({ ...base, trend: null })).toEqual({ tipo: "mantener" });
    expect(decidirModeloParaTrend({ ...base, trend: { ...TREND, duracionesAdmitidas: [] } })).toEqual({
      tipo: "mantener",
    });
  });

  test("cambia a un modelo compatible y lo dice; conserva la voz si el actual la tenía", () => {
    const d = decidirModeloParaTrend(base);
    expect(d.tipo).toBe("cambiar");
    if (d.tipo !== "cambiar") return;
    expect(d.modelo.modelo).toBe("veo-pro");
    expect(d.aviso).toContain("Hemos cambiado a VEO-PRO porque VEO-FAST no tiene clips de 6 s");
    expect(d.aviso).not.toContain("sin voz");
  });

  test("si el actual no tenía voz, vale el predeterminado compatible aunque tampoco la tenga", () => {
    const sinVoz = modelo("sin-voz", [4], { conVoz: false });
    const d = decidirModeloParaTrend({
      ...base,
      actual: sinVoz,
      candidatos: [PRO, MUDO],
      predeterminado: "mudo",
    });
    expect(d.tipo === "cambiar" && d.modelo.modelo).toBe("mudo");
  });

  test("si solo hay uno sin voz se cambia igualmente y se avisa de que perderá la voz", () => {
    const d = decidirModeloParaTrend({ ...base, candidatos: [FAST, MUDO] });
    expect(d.tipo === "cambiar" && d.modelo.modelo).toBe("mudo");
    expect(d.tipo === "cambiar" && d.aviso).toContain("sin voz");
  });

  test("prefiere el predeterminado entre los que conservan voz", () => {
    const otro = modelo("otro", [6]);
    const d = decidirModeloParaTrend({ ...base, candidatos: [FAST, PRO, otro], predeterminado: "otro" });
    expect(d.tipo === "cambiar" && d.modelo.modelo).toBe("otro");
  });

  test("respeta las restricciones de la plantilla", () => {
    const d = decidirModeloParaTrend({ ...base, trend: { ...TREND, modelosPermitidos: ["mudo"] } });
    expect(d.tipo === "cambiar" && d.modelo.modelo).toBe("mudo");
  });

  test("sin ningún compatible, error con la causa y sin cambiar nada", () => {
    const d = decidirModeloParaTrend({ ...base, candidatos: [FAST] });
    expect(d.tipo).toBe("ninguno");
    if (d.tipo !== "ninguno") return;
    expect(d.error).toContain("«Unboxing» hace falta un modelo que tenga precio para clips de 6 s");
    expect(d.error).toContain("VEO-FAST no tiene clips de 6 s");
    expect(d.error).toContain("No se ha aplicado y no se ha cobrado nada");
  });

  test("si el trend no admite el modelo actual se cambia aunque tenga tarifa", () => {
    const d = decidirModeloParaTrend({ ...base, actual: PRO, trend: { ...TREND, modelosPermitidos: ["mudo"] } });
    expect(d.tipo === "cambiar" && d.modelo.modelo).toBe("mudo");
    expect(d.tipo === "cambiar" && d.aviso).toContain("el trend no admite VEO-PRO");
  });

  test("si el actual está admitido y tiene tarifa se mantiene aunque haya restricción", () => {
    expect(
      decidirModeloParaTrend({ ...base, actual: PRO, trend: { ...TREND, modelosPermitidos: ["veo-pro"] } }),
    ).toEqual({
      tipo: "mantener",
    });
  });

  test("un trend sin duraciones admitidas solo comprueba la restricción", () => {
    const d = decidirModeloParaTrend({
      ...base,
      trend: { ...TREND, duracionesAdmitidas: [], modelosPermitidos: ["veo-pro"] },
    });
    expect(d.tipo === "cambiar" && d.modelo.modelo).toBe("veo-pro");
  });

  test("si la restricción deja fuera a todos los que cobran la duración, también es un error", () => {
    const d = decidirModeloParaTrend({ ...base, trend: { ...TREND, modelosPermitidos: ["veo-fast"] } });
    expect(d.tipo).toBe("ninguno");
    expect(d.tipo === "ninguno" && d.error).toContain("que este trend admita");
  });

  test("con varias duraciones admitidas basta con que el modelo cobre una", () => {
    const trend = { ...TREND, duracionesAdmitidas: [5, 8] };
    expect(decidirModeloParaTrend({ ...base, trend })).toEqual({ tipo: "mantener" });
    const soloSeis = modelo("seis", [6]);
    const d = decidirModeloParaTrend({ ...base, actual: soloSeis, trend });
    expect(d.tipo === "cambiar" && d.modelo.modelo).toBe("veo-fast");
    expect(d.tipo === "cambiar" && d.aviso).toContain("SEIS no tiene clips de 5 o 8 s");
    expect(d.tipo === "cambiar" && d.aviso).toContain("solo admite 5 o 8 s");
  });

  test("el motivo de un modelo sin ninguna de las duraciones admitidas las nombra todas", () => {
    expect(motivoSinDuracion(MUDO, [4, 8])).toBe("MUDO no tiene clips de 4 o 8 s (solo 6 s).");
    expect(motivoSinDuracion(MUDO, [])).toBeNull();
  });
});
