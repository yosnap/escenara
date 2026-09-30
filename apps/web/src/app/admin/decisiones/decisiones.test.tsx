import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { DecisionRegistradaVista, MetricasPreguntaVista } from "@/lib/decisiones";
import { AJUSTES_POR_DEFECTO } from "@/server/ajustes";
import { SeccionSombra } from "../ajustes/seccion-sombra";
import { MetricasSombra } from "./metricas-sombra";
import { TablaDecisiones } from "./tabla-decisiones";

/**
 * El panel de decisiones y el ajuste de la sombra dicen lo que hay: la muestra corta no se disfraza de porcentaje, un
 * fallo no se pinta como opinión y el coste se ve antes de encender nada.
 */

const metrica = (parcial: Partial<MetricasPreguntaVista>): MetricasPreguntaVista => ({
  pregunta: "afirmacion_verificable",
  nombre: "El guion tiene una afirmación que exige verificación",
  encendida: true,
  total: 12,
  fallidas: 1,
  sinOpinion: 2,
  etiquetadas: 5,
  aciertos: 3,
  falsosPermisos: 1,
  bloqueosInnecesarios: 1,
  comparables: 9,
  coincidencias: 4,
  euros: 0.0123,
  latenciaMediaMs: 740,
  ...parcial,
});

const decision = (parcial: Partial<DecisionRegistradaVista>): DecisionRegistradaVista => ({
  id: "d1",
  fecha: "2026-09-30T10:00:00.000Z",
  puerta: "envio",
  sujeto: "escena",
  tipo: "animacion",
  estado: "listo",
  accion: "permite",
  reglasVersion: "2026-09-30.2",
  reglas: [],
  umbrales: ["Avisos confirmables a la vez: 3"],
  evidencia: ["Modelo Kling, precio comprobado 2026-09-27."],
  sombra: [],
  etiqueta: null,
  ...parcial,
});

describe("métricas de la sombra", () => {
  test("con muestra corta enseña el recuento, no el porcentaje", () => {
    const html = renderToStaticMarkup(<MetricasSombra metricas={[metrica({})]} />);
    expect(html).toContain("3 de 5");
    expect(html).toContain("Muestra corta");
    expect(html).toContain("1 fallidas");
    expect(html).toContain("740 ms de media");
  });

  test("con muestra suficiente enseña el porcentaje", () => {
    const html = renderToStaticMarkup(<MetricasSombra metricas={[metrica({ etiquetadas: 40, aciertos: 30 })]} />);
    expect(html).toContain("75 %");
  });

  test("una pregunta sin decisiones que comparar no inventa coincidencia", () => {
    const html = renderToStaticMarkup(
      <MetricasSombra metricas={[metrica({ pregunta: "resultado", comparables: 0, latenciaMediaMs: null })]} />,
    );
    expect(html).toContain("—");
    expect(html).toContain("Sin latencia medida");
  });
});

describe("tabla de decisiones", () => {
  test("enseña acción, reglas, evidencia, umbrales, sombra y etiqueta", () => {
    const html = renderToStaticMarkup(
      <TablaDecisiones
        decisiones={[
          decision({
            reglas: [{ regla: "precio-antiguo", estado: "ajustes", motivo: "El precio es antiguo." }],
            sombra: [
              {
                pregunta: "afirmacion_verificable",
                veredicto: "no_pasa",
                confianza: 0.86,
                umbral: 0.75,
                evidencia: "Habría frenado para verificar.",
                error: "",
                modelo: "jev-1.13.0",
                coincide: false,
                reutilizada: false,
              },
            ],
            etiqueta: "acepta",
          }),
        ]}
      />,
    );
    expect(html).toContain("Dejó pasar");
    expect(html).toContain("precio-antiguo");
    expect(html).toContain("Qué se miró");
    expect(html).toContain("Avisos confirmables a la vez: 3");
    expect(html).toContain("No encaja");
    expect(html).toContain("No coincide con las reglas");
    expect(html).toContain("Aceptada");
  });

  test("un fallo de la sombra se pinta como fallo, no como opinión", () => {
    const html = renderToStaticMarkup(
      <TablaDecisiones
        decisiones={[
          decision({
            sombra: [
              {
                pregunta: "afirmacion_verificable",
                veredicto: null,
                confianza: null,
                umbral: 0.75,
                evidencia: "",
                error: "tiempo-agotado",
                modelo: "",
                coincide: null,
                reutilizada: false,
              },
            ],
          }),
        ]}
      />,
    );
    expect(html).toContain("Falló (tiempo-agotado): no opina.");
    expect(html).not.toContain("Encaja");
  });
});

describe("ajuste de la sombra", () => {
  const pintar = (cambios: Partial<typeof AJUSTES_POR_DEFECTO>) =>
    renderToStaticMarkup(
      <SeccionSombra valores={{ ...AJUSTES_POR_DEFECTO, ...cambios }} errorDe={() => undefined} onCambio={() => {}} />,
    );

  test("apagada de fábrica y con el coste explicado aunque no haya tarifa", () => {
    expect(AJUSTES_POR_DEFECTO.sombraActiva).toBe(false);
    const html = pintar({});
    expect(html).toContain("Encender la sombra");
    expect(html).toContain("Apagada de fábrica");
    expect(html).toContain("se apuntan a 0 €");
  });

  test("con tarifa enseña el coste estimado por evaluación", () => {
    const html = pintar({ coherenciaEurosPorMillonTokens: 40 });
    expect(html).toContain("0,0168");
  });
});
