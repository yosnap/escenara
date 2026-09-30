import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { CatalogoParaCrear, PlantillaVisible } from "@/lib/presets";
import { ESTADO_PLANTILLA_VACIO, PanelPlantilla, previsualizar } from "./panel-plantilla";
import { PasoFormato } from "./paso-formato";

/**
 * El formato (plantilla normal o trend) se elige en el primer paso de «Crear», y el paso del clip ya no repite el
 * selector ni la vista previa del trend.
 */
const NORMAL: PlantillaVisible = {
  id: "normal",
  nombre: "Clip social",
  descripcion: "La de siempre",
  kind: "base",
  duracionesAdmitidas: [],
  direccionDecidida: [],
  trendAllowsSpeech: false,
  capacidad: "image_to_video",
  variables: [{ nombre: "plano", tipo: "enumerado", etiqueta: "Plano", obligatoria: false, categoria: "plano" }],
  version: 1,
  versionId: "v1",
  deLaInstalacion: true,
};
const TREND: PlantillaVisible = {
  ...NORMAL,
  id: "trend",
  nombre: "Giro de producto",
  descripcion: "El producto gira en la mano",
  kind: "trend",
  duracionesAdmitidas: [6],
  direccionDecidida: ["camara"],
};

const catalogo = (plantillas: PlantillaVisible[]): CatalogoParaCrear =>
  ({ presets: [], incompatibles: {}, plantillas }) as unknown as CatalogoParaCrear;

const pintar = (
  plantillas: PlantillaVisible[],
  trend: PlantillaVisible | null,
  calculando = false,
  avisoModelo: string | null = null,
) =>
  renderToStaticMarkup(
    <PasoFormato
      numero={1}
      catalogo={catalogo(plantillas)}
      plantillaId={trend?.id ?? "normal"}
      trend={trend}
      calculando={calculando}
      deshabilitado={false}
      avisoModelo={avisoModelo}
      onPlantilla={() => {}}
    />,
  );

describe("paso de formato", () => {
  test("con trends: el selector, qué decide un trend y su vista previa", () => {
    const html = pintar([NORMAL, TREND], TREND);
    expect(html).toContain("Elige el formato");
    expect(html).toContain("Plantilla o trend vigente");
    expect(html).toContain("la duración la eliges con el modelo, salvo que el trend solo admita algunas");
    expect(html).toContain("Solo 6 s");
    expect(html).toContain("Decide él: movimiento de cámara");
    expect(html).toContain("Vista previa: Giro de producto");
    expect(html).toContain("Sin habla a cámara");
  });

  test("mientras se pide el coste del trend, lo dice", () => {
    expect(pintar([NORMAL, TREND], TREND, true)).toContain("Pidiendo el coste con la duración de este trend");
  });

  test("si al elegir el trend se cambió de modelo, se dice bajo el selector", () => {
    const html = pintar(
      [NORMAL, TREND],
      TREND,
      false,
      "Hemos cambiado a Veo Pro porque Veo Fast no tiene clips de 6 s.",
    );
    expect(html).toContain("Hemos cambiado a Veo Pro porque Veo Fast no tiene clips de 6 s.");
    expect(pintar([NORMAL, TREND], TREND)).not.toContain("Hemos cambiado");
  });

  test("sin trends no estorba: dice por qué no hay nada que elegir y que se sigue con Siguiente", () => {
    const html = pintar([NORMAL], null);
    expect(html).toContain("no tiene ningún trend publicado");
    expect(html).toContain("Sigue con «Siguiente»");
    expect(html).not.toContain("Plantilla o trend vigente");
  });
});

describe("el paso del clip no repite el formato", () => {
  test("sin selector ni vista previa del trend cuando el formato va aparte", () => {
    const cat = catalogo([NORMAL, TREND]);
    const estado = { ...ESTADO_PLANTILLA_VACIO, plantillaId: "trend" };
    const previa = previsualizar(cat, estado, "", null);
    const aparte = renderToStaticMarkup(
      <PanelPlantilla catalogo={cat} estado={estado} previa={previa} onCambio={() => {}} formatoAparte />,
    );
    expect(aparte).not.toContain("Plantilla o trend vigente");
    expect(aparte).not.toContain("Vista previa");
    // Sin la marca, el panel sigue siendo el de siempre (el del fotograma).
    const junto = renderToStaticMarkup(
      <PanelPlantilla catalogo={cat} estado={estado} previa={previa} onCambio={() => {}} />,
    );
    expect(junto).toContain("Plantilla o trend vigente");
    expect(junto).toContain("Vista previa: Giro de producto");
  });
});
