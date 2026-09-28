import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { EVALUACION_LISTA, REGLAS_VERSION } from "@/lib/controles";
import type { EscenaVista, EstimacionEscena, PlanVista } from "@/lib/proyectos";
import { DIRECCION_SIN_ELEGIR, impedimentosDelPlan } from "@/lib/proyectos";
import { TablaPlan } from "./proyecto";

/**
 * Test de render de la tabla de aprobación (criterio de aceptación de la 0.17.0): la estimación se muestra por
 * escena **y** en total, con la palabra «estimación» y la fecha del precio usado.
 *
 * Se renderiza de verdad con `react-dom/server`, no se inspecciona el código fuente: lo que se comprueba es el
 * HTML que acaba en la pantalla en la que alguien decide gastarse un dinero.
 */

const estimacion = (creditos: number): EstimacionEscena => ({
  creditosFotograma: 4,
  creditosAnimacion: creditos - 4,
  creditos,
  euros: creditos * 0.005,
  modeloFotograma: "Nano Banana 2 Lite",
  modeloAnimacion: "Veo 3.1 Lite",
  segundos: 4,
  comprobado: "2026-09-27",
  precioAntiguo: false,
  margen: 30,
  selloFotograma: "kie:nano-banana-2-lite:imagen@v1",
  selloAnimacion: "kie:veo3_lite:clip@v1",
});

const escena = (id: string, orden: number, est: EstimacionEscena | null): EscenaVista => ({
  id,
  proyectoId: "p1",
  orden,
  texto: "",
  direccion: DIRECCION_SIN_ELEGIR,
  accion: `Escena de prueba ${orden}`,
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

const plan = (parcial: Partial<PlanVista> = {}): PlanVista => {
  const base: PlanVista = {
    creditosAsistente: 0,
    totalCreditos: 168,
    totalEuros: 0.84,
    presupuestoCreditos: 500,
    escenasSinEstimacion: 0,
    afirmacionesPorVerificar: 0,
    afirmacionesBloqueantes: 0,
    comprobado: "2026-09-27",
    margen: 30,
    estadoControl: "listo",
    impedimentos: [],
    ...parcial,
  };
  return base;
};

const pintar = (p: PlanVista, escenas: EscenaVista[]) => renderToStaticMarkup(<TablaPlan plan={p} escenas={escenas} />);

describe("tabla de aprobación del plan", () => {
  const escenas = [escena("s1", 1, estimacion(84)), escena("s2", 2, estimacion(84))];

  test("cada escena muestra su coste como estimación y con la fecha del precio", () => {
    const html = pintar(plan(), escenas);
    // Dos escenas de 84 créditos, cada una con su propia cifra etiquetada.
    expect(html.match(/84 créditos \(estimación, precio del 27\/09\/2026\)/g)).toHaveLength(2);
  });

  test("el total del proyecto también se muestra como estimación y con la fecha", () => {
    const html = pintar(plan(), escenas);
    expect(html).toContain("Total estimado del proyecto");
    expect(html).toContain("168 créditos (estimación, precio del 27/09/2026)");
  });

  test("muestra el presupuesto autorizado del proyecto, y dice «sin fijar» cuando no hay", () => {
    expect(pintar(plan(), escenas)).toContain("500 créditos");
    expect(pintar(plan({ presupuestoCreditos: 0 }), escenas)).toContain("sin fijar");
  });

  test("avisa del margen prudente cuando se ha aplicado", () => {
    expect(pintar(plan(), escenas)).toContain("margen prudente del 30 %");
    expect(pintar(plan({ margen: 0 }), escenas)).not.toContain("margen prudente");
  });

  test("una escena sin precio se dice con su motivo, no se estima a ojo", () => {
    const html = pintar(plan({ escenasSinEstimacion: 1 }), [escena("s1", 1, null)]);
    expect(html).toContain("Sin precio registrado");
    expect(html).toContain("sin precio registrado");
  });

  test("enumera lo que falta para poder aprobar", () => {
    const impedimentos = impedimentosDelPlan({
      totalEscenas: 2,
      escenasSinEstimacion: 0,
      totalCreditos: 168,
      presupuestoCreditos: 100,
      afirmacionesBloqueantes: 1,
    });
    const html = pintar(plan({ presupuestoCreditos: 100, impedimentos }), escenas);
    expect(html).toContain("Para poder aprobar el plan falta esto");
    expect(html).toContain("presupuesto autorizado del proyecto");
    expect(html).toContain("salud");
  });

  test("sin ninguna escena no inventa cifras y dice qué hacer", () => {
    const html = pintar(plan({ totalCreditos: 0, totalEuros: 0, comprobado: "" }), []);
    expect(html).toContain("Todavía no hay escenas que estimar");
    // Lo que falta es una escena, no un precio: decir lo segundo manda a quien mira a arreglar lo que no es.
    expect(html).toContain("Añade una escena");
    expect(html).not.toContain("no tienen precio registrado");
  });

  test("con escenas pero sin precios en el catálogo, lo dice y manda a quien administra", () => {
    const html = pintar(plan({ totalCreditos: 0, totalEuros: 0, comprobado: "", escenasSinEstimacion: 1 }), [
      escena("s1", 1, null),
    ]);
    expect(html).toContain("no tienen precio registrado");
    expect(html).toContain("quien administra");
  });

  test("el gasto del asistente se muestra y se dice que cuenta contra el presupuesto", () => {
    const html = pintar(plan({ creditosAsistente: 3 }), escenas);
    expect(html).toContain("Ya gastado por el asistente de guion");
    expect(html).toContain("3 créditos");
    expect(html).toContain("dinero del mismo bote");
    // Sin gasto del asistente, ni la fila ni la explicación aparecen.
    expect(pintar(plan(), escenas)).not.toContain("Ya gastado por el asistente");
  });
});
