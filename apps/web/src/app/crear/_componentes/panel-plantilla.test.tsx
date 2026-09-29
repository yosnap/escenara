import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CATEGORIAS_DE_LA_DIRECCION, type CatalogoParaCrear, type PlantillaVisible } from "@/lib/presets";
import { confirmacionDePlantilla, type EstadoPlantilla, PanelPlantilla, previsualizar } from "./panel-plantilla";

/**
 * **La botonera de la plantilla no repite lo que ya elige la dirección** (0.25.2), comprobado sobre el HTML
 * que acaba en la pantalla.
 *
 * Y, cuando no le queda ninguna categoría, no se queda con un título vacío: **desaparece**, no se envía y sus
 * variables obligatorias no bloquean el botón de generar. Lo que ofrecía llega al prompt por la dirección.
 */

const PLANTILLA: PlantillaVisible = {
  id: "t1",
  nombre: "Clip social",
  descripcion: "",
  kind: "base",
  targetSeconds: null,
  trendAllowsSpeech: false,
  capacidad: "image_to_video",
  variables: [
    { nombre: "duracion", tipo: "numero", etiqueta: "Duración", obligatoria: true, categoria: "duracion" },
    { nombre: "plano", tipo: "enumerado", etiqueta: "Plano", obligatoria: false, categoria: "plano" },
    { nombre: "estilo", tipo: "enumerado", etiqueta: "Look", obligatoria: false, categoria: "estilo" },
    { nombre: "escena", tipo: "texto", etiqueta: "Qué quieres ver", obligatoria: true },
  ],
  version: 1,
  versionId: "v1",
  deLaInstalacion: true,
};

const CATALOGO: CatalogoParaCrear = {
  presets: [
    {
      id: "p1",
      categoria: "plano",
      nombre: "Primer plano",
      descripcion: "",
      proporcion: null,
      segundos: null,
      deLaInstalacion: true,
    },
    {
      id: "d1",
      categoria: "duracion",
      nombre: "8 segundos",
      descripcion: "",
      proporcion: null,
      segundos: 8,
      deLaInstalacion: true,
    },
    {
      id: "e1",
      categoria: "estilo",
      nombre: "Natural",
      descripcion: "",
      proporcion: null,
      segundos: null,
      deLaInstalacion: true,
    },
    {
      id: "v1",
      categoria: "vestuario",
      nombre: "Ropa de casa",
      descripcion: "",
      proporcion: null,
      segundos: null,
      deLaInstalacion: true,
    },
  ],
  incompatibles: {},
  plantillas: [PLANTILLA],
  modelo: "veo3_lite",
  limites: { nombre: "Veo 3.1 Lite", proporciones: ["9:16"], duraciones: [8], maximoReferencias: 1 },
};

const ESTADO: EstadoPlantilla = { plantillaId: "t1", seleccion: {} };

const pintar = (previa: ReturnType<typeof previsualizar>) =>
  renderToStaticMarkup(<PanelPlantilla catalogo={CATALOGO} estado={ESTADO} previa={previa} onCambio={() => {}} />);

describe("el paso del clip no repite las categorías de la dirección", () => {
  test("un trend sigue visible y se envía aunque la dirección cubra sus categorías", () => {
    const trend: PlantillaVisible = { ...PLANTILLA, id: "trend", kind: "trend", targetSeconds: 8 };
    const catalogo = { ...CATALOGO, plantillas: [trend] };
    const estado = { plantillaId: trend.id, seleccion: {} };
    const previa = previsualizar(catalogo, estado, "Plano de producto", null, CATEGORIAS_DE_LA_DIRECCION);
    expect(previa.enUso).toBe(true);
    expect(confirmacionDePlantilla(previa, estado)).toMatchObject({ plantillaId: trend.id });
    expect(
      renderToStaticMarkup(<PanelPlantilla catalogo={catalogo} estado={estado} previa={previa} onCambio={() => {}} />),
    ).toContain("Vista previa");
  });
  test("con la dirección a la vista el panel desaparece, no bloquea y no se envía", () => {
    const previa = previsualizar(CATALOGO, ESTADO, "", null, CATEGORIAS_DE_LA_DIRECCION);
    expect(previa.enUso).toBe(false);
    expect(previa.categorias).toEqual([]);
    // Ni la duración ni «Qué quieres ver» frenan: la duración se elige arriba con el modelo y lo que se ve lo
    // dicen la imagen de partida y la dirección.
    expect(previa.motivos).toEqual([]);
    expect(previa.faltan).toEqual([]);
    expect(pintar(previa)).toBe("");
    expect(confirmacionDePlantilla(previa, ESTADO)).toEqual({});
  });

  test("sin dirección que la cubra, la plantilla se ofrece entera y sigue pidiendo lo suyo", () => {
    const previa = previsualizar(CATALOGO, ESTADO, "", null);
    expect(previa.enUso).toBe(true);
    expect(previa.categorias).toEqual(["estilo", "duracion", "plano"]);
    expect(previa.faltan).toEqual(["Duración", "Qué quieres ver"]);
    const html = pintar(previa);
    expect(html).toContain("Plano");
    expect(html).toContain("Duración");
    expect(confirmacionDePlantilla(previa, ESTADO)).toMatchObject({ plantillaId: "t1" });
  });

  test("lo que la dirección no cubre se sigue eligiendo aquí", () => {
    const conVestuario: CatalogoParaCrear = {
      ...CATALOGO,
      plantillas: [
        {
          ...PLANTILLA,
          variables: [
            ...PLANTILLA.variables,
            { nombre: "ropa", tipo: "enumerado", etiqueta: "Vestuario", obligatoria: false, categoria: "vestuario" },
          ],
        },
      ],
    };
    const previa = previsualizar(conVestuario, ESTADO, "Una cocina luminosa.", null, CATEGORIAS_DE_LA_DIRECCION);
    expect(previa.enUso).toBe(true);
    expect(previa.categorias).toEqual(["vestuario"]);
    // La duración cubierta ya no falta, aunque la plantilla la declare obligatoria.
    expect(previa.faltan).toEqual([]);
    expect(pintar(previa)).toContain("Ropa de casa");
  });
});
