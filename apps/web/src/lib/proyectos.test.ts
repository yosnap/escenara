import { describe, expect, test } from "bun:test";
import { EVALUACION_LISTA, REGLAS_VERSION } from "./controles";
import {
  type EscenaVista,
  type EstimacionEscena,
  filasDelPlan,
  formatearFecha,
  impedimentosDelPlan,
  type PlanVista,
  puedeAprobarse,
  resumenDeEscena,
  textoEstimacion,
} from "./proyectos";

/**
 * Reglas del plan de un proyecto (0.17.0). Son funciones puras a propósito: el servidor y el navegador deciden
 * lo mismo con el mismo código, así que lo que se prueba aquí es lo que se ve en la pantalla de aprobación.
 */

const estimacion = (creditos: number, comprobado = "2026-09-27"): EstimacionEscena => ({
  creditosFotograma: 4,
  creditosAnimacion: creditos - 4,
  creditos,
  euros: creditos * 0.005,
  modeloFotograma: "Nano Banana 2 Lite",
  modeloAnimacion: "Veo 3.1 Lite",
  segundos: 4,
  comprobado,
  precioAntiguo: false,
  margen: 30,
  selloFotograma: "kie:nano-banana-2-lite:imagen@v1",
  selloAnimacion: "kie:veo3_lite:clip@v1",
});

const escena = (id: string, orden: number, accion: string, est: EstimacionEscena | null): EscenaVista => ({
  id,
  proyectoId: "p1",
  orden,
  texto: "",
  accion,
  segundos: 4,
  estado: "borrador",
  aprobadaEn: null,
  motivoInvalidacion: "",
  trabajoId: null,
  fotograma: null,
  estimacion: est,
  afirmaciones: [],
  controles: EVALUACION_LISTA(REGLAS_VERSION),
});

describe("texto de una estimación", () => {
  test("lleva siempre la palabra «estimación» y la fecha del precio usado", () => {
    const texto = textoEstimacion(84, 0.42, "2026-09-27");
    expect(texto).toContain("estimación");
    expect(texto).toContain("27/09/2026");
    expect(texto).toContain("84 créditos");
  });

  test("sin precio registrado lo dice en lugar de inventar una fecha", () => {
    const texto = textoEstimacion(0, 0, "");
    expect(texto).toContain("estimación");
    expect(texto).toContain("sin precio registrado");
  });

  test("la fecha se muestra en formato de España, y una fecha ilegible se deja tal cual", () => {
    expect(formatearFecha("2026-01-05")).toBe("05/01/2026");
    expect(formatearFecha("mañana")).toBe("mañana");
  });
});

describe("desglose del plan por escena", () => {
  test("cada fila lleva su estimación con la palabra «estimación» y la fecha", () => {
    const filas = filasDelPlan([escena("s1", 1, "Plano medio en la azotea", estimacion(84))]);
    expect(filas).toHaveLength(1);
    expect(filas[0]?.estimacion).toContain("estimación");
    expect(filas[0]?.estimacion).toContain("27/09/2026");
    expect(filas[0]?.motivo).toBe("");
  });

  test("una escena sin precio no se estima y dice por qué", () => {
    const filas = filasDelPlan([escena("s1", 1, "Plano general", null)]);
    expect(filas[0]?.creditos).toBe(0);
    expect(filas[0]?.motivo).toContain("Sin precio registrado");
  });

  test("el resumen recorta lo largo y cae en el número de escena si no hay nada escrito", () => {
    expect(resumenDeEscena(escena("s1", 3, "", null))).toBe("Escena 3");
    expect(resumenDeEscena(escena("s1", 1, "x".repeat(200), null))).toHaveLength(70);
  });
});

describe("qué impide aprobar un plan", () => {
  const base = {
    totalEscenas: 2,
    escenasSinEstimacion: 0,
    totalCreditos: 100,
    presupuestoCreditos: 200,
    afirmacionesBloqueantes: 0,
  };

  test("un plan completo y dentro del presupuesto se puede aprobar", () => {
    expect(impedimentosDelPlan(base)).toEqual([]);
  });

  test("un total por encima del presupuesto autorizado no se puede aprobar", () => {
    const impedimentos = impedimentosDelPlan({ ...base, totalCreditos: 300 });
    expect(impedimentos).toHaveLength(1);
    expect(impedimentos[0]).toContain("presupuesto autorizado");
  });

  test("sin presupuesto fijado tampoco se puede aprobar", () => {
    expect(impedimentosDelPlan({ ...base, presupuestoCreditos: 0 })[0]).toContain("Fija el presupuesto");
  });

  test("una escena sin estimación bloquea el plan entero", () => {
    expect(impedimentosDelPlan({ ...base, escenasSinEstimacion: 1 })[0]).toContain("no se puede estimar");
  });

  test("una afirmación de salud sin revisar bloquea la aprobación", () => {
    expect(impedimentosDelPlan({ ...base, afirmacionesBloqueantes: 2 })[0]).toContain("salud");
  });

  test("un proyecto sin escenas no se aprueba", () => {
    expect(impedimentosDelPlan({ ...base, totalEscenas: 0 })[0]).toContain("ninguna escena");
  });

  test("puedeAprobarse solo es cierto con la lista de impedimentos vacía", () => {
    const plan = { impedimentos: [] } as unknown as PlanVista;
    expect(puedeAprobarse(plan)).toBe(true);
    expect(puedeAprobarse({ ...plan, impedimentos: ["falta algo"] })).toBe(false);
  });
});
