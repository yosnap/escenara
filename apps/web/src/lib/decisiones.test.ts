import { describe, expect, test } from "bun:test";
import {
  coincideConLasReglas,
  costeEstimadoPorEvaluacion,
  etiquetaDeCorreccion,
  etiquetaDeRevisiones,
  metricasDe,
  type OpinionMedida,
  type RevisionHumana,
  resumenDeEvidencia,
  resumenDeUmbrales,
} from "./decisiones";

/**
 * Lo puro de las decisiones y la sombra: la etiqueta humana que le toca a cada decisión y las métricas que salen de
 * ahí. Sin base de datos: todo con datos de ejemplo.
 */

const t = (minuto: number) => new Date(Date.UTC(2026, 8, 30, 10, minuto));
const revision = (
  minuto: number,
  veredicto: "acepta" | "rechaza",
  invalidada: number | null = null,
): RevisionHumana => ({
  fecha: t(minuto),
  veredicto,
  invalidada: invalidada === null ? null : t(invalidada),
});

describe("etiqueta humana de una decisión", () => {
  test("cuenta la primera revisión posterior y anterior a la siguiente producción", () => {
    const revisiones = [revision(5, "rechaza"), revision(20, "acepta")];
    expect(etiquetaDeRevisiones(t(0), revisiones, t(10))).toBe("rechaza");
    // Después de regenerar (minuto 10), la revisión del minuto 20 es de otro clip.
    expect(etiquetaDeRevisiones(t(10), revisiones, null)).toBe("acepta");
  });

  test("sin revisión en su ventana no hay etiqueta", () => {
    expect(etiquetaDeRevisiones(t(0), [revision(15, "acepta")], t(10))).toBeNull();
    expect(etiquetaDeRevisiones(t(0), [], null)).toBeNull();
  });

  test("una revisión anterior solo cuenta si se pide y seguía en pie", () => {
    const revisiones = [revision(1, "acepta"), revision(2, "rechaza", 3)];
    expect(etiquetaDeRevisiones(t(5), revisiones, null)).toBeNull();
    expect(etiquetaDeRevisiones(t(5), revisiones, null, true)).toBe("acepta");
    expect(etiquetaDeRevisiones(t(2), [revision(1, "rechaza", 4)], null, true)).toBe("rechaza");
  });

  test("la corrección directa de un veredicto se traduce a aceptar o rechazar", () => {
    expect(etiquetaDeCorreccion("pasa", "acierta")).toBe("acepta");
    expect(etiquetaDeCorreccion("pasa", "se_equivoca")).toBe("rechaza");
    expect(etiquetaDeCorreccion("no_pasa", "acierta")).toBe("rechaza");
    expect(etiquetaDeCorreccion("no_pasa", "se_equivoca")).toBe("acepta");
    expect(etiquetaDeCorreccion("revisar", "acierta")).toBeNull();
    expect(etiquetaDeCorreccion("pasa", null)).toBeNull();
  });
});

const opinion = (parcial: Partial<OpinionMedida>): OpinionMedida => ({
  veredicto: "pasa",
  etiqueta: null,
  coincide: null,
  euros: 0.01,
  latenciaMs: 800,
  fallida: false,
  reutilizada: false,
  ...parcial,
});

describe("métricas de la sombra", () => {
  test("falsos permisos, bloqueos innecesarios y aciertos salen solo de lo etiquetado", () => {
    const m = metricasDe([
      opinion({ veredicto: "pasa", etiqueta: "acepta", coincide: true }),
      opinion({ veredicto: "pasa", etiqueta: "rechaza", coincide: true }),
      opinion({ veredicto: "no_pasa", etiqueta: "acepta", coincide: false }),
      opinion({ veredicto: "no_pasa", etiqueta: "rechaza", coincide: false }),
      opinion({ veredicto: "no_pasa", etiqueta: null, coincide: false }),
      opinion({ veredicto: "revisar", etiqueta: "rechaza" }),
      opinion({ veredicto: null, fallida: true, euros: 0, latenciaMs: 10_000 }),
    ]);
    expect(m.total).toBe(7);
    expect(m.etiquetadas).toBe(4);
    expect(m.aciertos).toBe(2);
    expect(m.falsosPermisos).toBe(1);
    expect(m.bloqueosInnecesarios).toBe(1);
    expect(m.sinOpinion).toBe(1);
    expect(m.fallidas).toBe(1);
    expect(m.comparables).toBe(5);
    expect(m.coincidencias).toBe(2);
    expect(m.euros).toBe(0.06);
    // La latencia media es de las que contestaron: el fallo por tiempo no la infla.
    expect(m.latenciaMediaMs).toBe(800);
  });

  test("una opinión reutilizada no cuenta en coste ni en latencia, pero sí en aciertos", () => {
    const m = metricasDe([
      opinion({ etiqueta: "acepta", euros: 0.02, latenciaMs: 600 }),
      opinion({ etiqueta: "acepta", reutilizada: true, euros: 0, latenciaMs: 0 }),
    ]);
    expect(m.aciertos).toBe(2);
    expect(m.euros).toBe(0.02);
    expect(m.latenciaMediaMs).toBe(600);
  });

  test("sin opiniones todo es cero y la latencia no existe", () => {
    expect(metricasDe([])).toMatchObject({ total: 0, etiquetadas: 0, euros: 0, latenciaMediaMs: null });
  });

  test("coincidir con las reglas: «pasa» es dejar pasar; «míralo tú» y un fallo no se comparan", () => {
    expect(coincideConLasReglas("pasa", "permite")).toBe(true);
    expect(coincideConLasReglas("pasa", "rechaza")).toBe(false);
    expect(coincideConLasReglas("no_pasa", "pide-confirmacion")).toBe(true);
    expect(coincideConLasReglas("no_pasa", "permite")).toBe(false);
    expect(coincideConLasReglas("revisar", "permite")).toBeNull();
    expect(coincideConLasReglas(null, "permite")).toBeNull();
  });

  test("el coste estimado por evaluación sale de la tarifa de Jev", () => {
    expect(costeEstimadoPorEvaluacion(0)).toBe(0);
    expect(costeEstimadoPorEvaluacion(40)).toBeCloseTo(0.0168, 6);
  });
});

describe("resumen de la evidencia", () => {
  test("cuenta en frases lo que se miró y los umbrales", () => {
    const lineas = resumenDeEvidencia({
      tipo: "fotograma",
      modelo: { nombre: "Nano Banana 2 Lite", precioComprobado: "2026-09-27", precioCaducado: true },
      presupuesto: { creditos: 10, disponibleUsuario: null, autorizadoProyecto: 50, comprometidoProyecto: 20 },
      escena: { planAprobado: true, aprobada: false, afirmacionesPorVerificar: 2 },
      canto: { activa: true },
    });
    expect(lineas.join(" ")).toContain("Nano Banana 2 Lite");
    expect(lineas.join(" ")).toContain("(caducado)");
    expect(lineas.join(" ")).toContain("disponible sin tope");
    expect(lineas.join(" ")).toContain("2 afirmaciones por verificar");
    expect(lineas.at(-1)).toBe("También se miró: canto.");
    expect(resumenDeUmbrales({ maximoAvisos: 3, exigirPrecioFresco: true, otro: 1 })).toEqual([
      "Avisos confirmables a la vez: 3",
      "Avisar de precio antiguo: sí",
      "otro: 1",
    ]);
  });

  test("una evidencia vieja, vacía o rara no revienta", () => {
    expect(resumenDeEvidencia({})).toEqual([]);
    expect(resumenDeEvidencia(null)).toEqual([]);
    expect(resumenDeEvidencia({ modelo: "texto", escena: [1] })).toEqual([]);
    expect(resumenDeUmbrales("nada")).toEqual([]);
  });
});
