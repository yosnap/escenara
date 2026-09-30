import { describe, expect, test } from "bun:test";
import {
  coincideConLasReglas,
  costeEstimadoPorEvaluacion,
  etiquetaDeAfirmaciones,
  etiquetaDeCorreccion,
  etiquetaDeRevisiones,
  metricasDe,
  type OpinionMedida,
  type RevisionHumana,
  resumenDeEvidencia,
  resumenDeUmbrales,
  sinNombres,
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
  ...parcial,
});

const GASTO = { total: 9, fallidas: 1, euros: 0.061_23, latenciaMediaMs: 800 };

describe("etiqueta de las afirmaciones", () => {
  test("verificar o corregir dice que había que frenar; descartar, que no aplicaba; sin resolver no hay etiqueta", () => {
    expect(etiquetaDeAfirmaciones(["verificada"])).toBe("rechaza");
    expect(etiquetaDeAfirmaciones(["descartada", "corregida"])).toBe("rechaza");
    expect(etiquetaDeAfirmaciones(["descartada"])).toBe("acepta");
    expect(etiquetaDeAfirmaciones([])).toBeNull();
    expect(etiquetaDeAfirmaciones(["por_verificar"])).toBeNull();
  });
});

describe("métricas de la sombra", () => {
  test("falsos permisos, bloqueos innecesarios y aciertos salen solo de lo etiquetado", () => {
    const m = metricasDe(
      [
        opinion({ veredicto: "pasa", etiqueta: "acepta", coincide: true }),
        opinion({ veredicto: "pasa", etiqueta: "rechaza", coincide: true }),
        opinion({ veredicto: "no_pasa", etiqueta: "acepta", coincide: false }),
        opinion({ veredicto: "no_pasa", etiqueta: "rechaza", coincide: true }),
        opinion({ veredicto: "no_pasa", etiqueta: null, coincide: false }),
        opinion({ veredicto: "revisar", etiqueta: "rechaza" }),
      ],
      GASTO,
    );
    expect(m.escenas).toBe(6);
    expect(m.etiquetadas).toBe(4);
    expect(m.aciertos).toBe(2);
    expect(m.falsosPermisos).toBe(1);
    expect(m.bloqueosInnecesarios).toBe(1);
    expect(m.sinOpinion).toBe(1);
    expect(m.comparables).toBe(5);
    expect(m.coincidencias).toBe(3);
    // El gasto se cuenta con todas las filas, no con la muestra.
    expect(m.total).toBe(9);
    expect(m.fallidas).toBe(1);
    expect(m.euros).toBe(0.0612);
    expect(m.latenciaMediaMs).toBe(800);
  });

  test("sin opiniones todo es cero", () => {
    expect(metricasDe([], { total: 0, fallidas: 0, euros: 0, latenciaMediaMs: null })).toMatchObject({
      total: 0,
      escenas: 0,
      etiquetadas: 0,
      euros: 0,
      latenciaMediaMs: null,
    });
  });

  test("coincidir con la regla de afirmaciones: «pasa» es que no salte; sin regla evaluada no se compara", () => {
    expect(coincideConLasReglas("pasa", false)).toBe(true);
    expect(coincideConLasReglas("pasa", true)).toBe(false);
    expect(coincideConLasReglas("no_pasa", true)).toBe(true);
    expect(coincideConLasReglas("no_pasa", false)).toBe(false);
    expect(coincideConLasReglas("no_pasa", null)).toBeNull();
    expect(coincideConLasReglas("revisar", true)).toBeNull();
    expect(coincideConLasReglas(null, false)).toBeNull();
  });

  test("el coste estimado por evaluación sale de la tarifa de Jev", () => {
    expect(costeEstimadoPorEvaluacion(0)).toBe(0);
    expect(costeEstimadoPorEvaluacion(40)).toBeCloseTo(0.0168, 6);
  });
});

describe("sin nombres", () => {
  test("sustituye los nombres conocidos y oculta cualquier otra cita, salvo las fijas del motor", () => {
    const conocidos = [
      { nombre: "Elisabeth Ruiz", marcador: "el personaje" },
      { nombre: "Crema Lumi", marcador: "el producto" },
    ];
    expect(sinNombres("«Elisabeth Ruiz» no se puede usar para generar todavía.", conocidos)).toBe(
      "«el personaje» no se puede usar para generar todavía.",
    );
    expect(sinNombres("La foto de crema lumi no cabe; añádela en «Tu cuenta».", conocidos)).toBe(
      "La foto de el producto no cabe; añádela en «Tu cuenta».",
    );
    // Sin datos (una fila vieja), cualquier cita que no sea del motor se oculta.
    expect(sinNombres("Las referencias de «Elisa» y de «persona 2» no cubren «Antes de generar».")).toBe(
      "Las referencias de «nombre oculto» y de «persona 2» no cubren «Antes de generar».",
    );
  });

  test("es idempotente", () => {
    const una = sinNombres("«Ana» y «Beto»");
    expect(sinNombres(una)).toBe(una);
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
