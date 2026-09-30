import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { DemoPlantilla } from "@/lib/demo-plantilla";
import type { CatalogoParaCrear, PlantillaVisible } from "@/lib/presets";
import {
  type EstadoPlantilla,
  PanelPlantilla,
  previsualizar,
  SelectorPlantilla,
  VistaPreviaTrend,
} from "./panel-plantilla";
import { PasoFormato } from "./paso-formato";

/**
 * **El ejemplo de las plantillas y los trends se ve en «Crear»** antes de gastar, y la plantilla que se aplica sola
 * (cuando solo hay una) deja de ser invisible. Comprobado sobre el HTML que acaba en la pantalla.
 */

const DEMO: DemoPlantilla = {
  tipo: "imagen",
  url: "/api/prompts/plantillas/base/demo?v=aaaaaaaa",
  alt: "Foto de una cafetería con un móvil",
  ancho: 1080,
  alto: 1920,
};
const DEMO_CLIP: DemoPlantilla = {
  ...DEMO,
  tipo: "video",
  url: "/api/prompts/plantillas/trend/demo?v=bbbbbbbb",
  alt: "Una mano abre la caja",
};

const plantilla = (id: string, cambios: Partial<PlantillaVisible> = {}): PlantillaVisible => ({
  id,
  nombre: id === "base" ? "Fotograma para redes" : `Plantilla ${id}`,
  descripcion: "Foto vertical lista para publicar.",
  kind: "base",
  duracionesAdmitidas: [],
  direccionDecidida: [],
  trendAllowsSpeech: false,
  capacidad: "image_edit",
  variables: [{ nombre: "escena", tipo: "texto", etiqueta: "Qué quieres ver", obligatoria: true }],
  version: 1,
  versionId: `${id}-v1`,
  deLaInstalacion: true,
  ...cambios,
});

const catalogo = (plantillas: PlantillaVisible[]): CatalogoParaCrear => ({
  presets: [],
  incompatibles: {},
  plantillas,
  modelo: "modelo",
  limites: { nombre: "Modelo", proporciones: [], duraciones: [], maximoReferencias: 4 },
});

const panel = (c: CatalogoParaCrear, plantillaId: string, formatoAparte = false) => {
  const estado: EstadoPlantilla = { plantillaId, seleccion: {} };
  return renderToStaticMarkup(
    <PanelPlantilla
      catalogo={c}
      estado={estado}
      previa={previsualizar(c, estado, "una escena", null)}
      onCambio={() => {}}
      formatoAparte={formatoAparte}
    />,
  );
};

describe("la plantilla única deja de ser invisible", () => {
  test("dice cuál se aplica y enseña su ejemplo, sin selector", () => {
    const html = panel(catalogo([plantilla("base", { demo: DEMO })]), "base");
    expect(html).toContain("Se aplica la plantilla «Fotograma para redes».");
    expect(html).toContain("Foto vertical lista para publicar.");
    expect(html).toContain(DEMO.url);
    expect(html).toContain('alt="Foto de una cafetería con un móvil"');
    expect(html).not.toContain("Plantilla o trend vigente");
  });

  test("sin ejemplo dice igualmente cuál se aplica, y sin nada del texto de la plantilla", () => {
    const html = panel(catalogo([plantilla("base")]), "base");
    expect(html).toContain("Se aplica la plantilla «Fotograma para redes».");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<video");
  });

  test("con varias plantillas no se repite el bloque: manda el selector", () => {
    const html = panel(catalogo([plantilla("base"), plantilla("otra")]), "base");
    expect(html).not.toContain("Se aplica la plantilla");
    expect(html).toContain("Plantilla o trend vigente");
  });

  test("donde la plantilla se elige en otro paso no se repite", () => {
    const html = panel(catalogo([plantilla("base", { demo: DEMO })]), "base", true);
    expect(html).not.toContain("Se aplica la plantilla");
  });
});

describe("selector de plantilla o trend", () => {
  const trend = plantilla("trend", { kind: "trend", capacidad: "image_to_video", demo: DEMO_CLIP });
  const conDemo = catalogo([plantilla("base", { demo: DEMO }), trend]);

  test("marca las opciones con ejemplo y enseña el de la plantilla normal elegida", () => {
    const html = renderToStaticMarkup(<SelectorPlantilla catalogo={conDemo} valor="base" onCambio={() => {}} />);
    expect(html).toContain(DEMO.url);
    expect(html).toContain("Ejemplo de «Fotograma para redes»");
  });

  test("el ejemplo de un trend no se repite en el selector: lo enseña su vista previa", () => {
    const html = renderToStaticMarkup(<SelectorPlantilla catalogo={conDemo} valor="trend" onCambio={() => {}} />);
    expect(html).not.toContain(DEMO_CLIP.url);
  });

  test("sin ejemplo no pinta nada más que el selector", () => {
    const sin = catalogo([plantilla("base"), plantilla("otra")]);
    const html = renderToStaticMarkup(<SelectorPlantilla catalogo={sin} valor="base" onCambio={() => {}} />);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<video");
  });
});

describe("vista previa del trend", () => {
  const trend = plantilla("trend", { kind: "trend", capacidad: "image_to_video" });

  test("con ejemplo enseña el clip, silenciado y sin arrancar solo", () => {
    const html = renderToStaticMarkup(<VistaPreviaTrend trend={{ ...trend, demo: DEMO_CLIP }} />);
    expect(html).toContain("Vista previa: Plantilla trend");
    expect(html).toContain(DEMO_CLIP.url);
    expect(html).toContain("muted");
    expect(html).toContain('preload="none"');
    expect(html).not.toContain("autoplay");
  });

  test("sin ejemplo es la misma vista previa de siempre", () => {
    const html = renderToStaticMarkup(<VistaPreviaTrend trend={trend} />);
    expect(html).toContain("Vista previa: Plantilla trend");
    expect(html).not.toContain("<video");
    expect(html).not.toContain("<img");
  });
});

describe("paso de formato del clip", () => {
  test("sin trends y con una sola plantilla dice cuál es y enseña su ejemplo", () => {
    const html = renderToStaticMarkup(
      <PasoFormato
        numero={1}
        catalogo={catalogo([plantilla("base", { demo: DEMO })])}
        plantillaId="base"
        trend={null}
        calculando={false}
        deshabilitado={false}
        onPlantilla={() => {}}
      />,
    );
    expect(html).toContain("Se aplica la plantilla «Fotograma para redes».");
    expect(html).toContain(DEMO.url);
  });
});
