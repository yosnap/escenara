import { describe, expect, test } from "bun:test";
import type { ModeloVista } from "@/lib/catalogo";
import { EJES_VOZ_POR_DEFECTO } from "@/lib/direccion";
import { type DireccionDeClip, dirigirClip } from "../direccion/clip";
import { componerSeisC, type SeisC } from "../direccion/fotograma";
import type { ProductoEnPrompt } from "../direccion/producto";
import { adaptadorKie } from "../proveedores/kie/adaptador";
import { repartirReferencias } from "./referencias";

/**
 * El producto **en el prompt y en la entrada del proveedor** (0.26.0), sin base de datos y sin red: los
 * compositores son puros y el reparto de referencias también, así que se prueban enteros por donde se rompen.
 */

const PRODUCTO: ProductoEnPrompt = {
  descripcion: "a white jar with a golden cap and a black label",
  accion: "The person turns the product towards the camera, front label facing the lens",
  soloProducto: false,
  conReferencias: true,
};

const DIRECCION: DireccionDeClip = {
  formato: "ugc_a_camara",
  movimientosCamara: [],
  nivelCamara: "basico",
  plano: "Medium shot",
  angulo: "Eye level",
  registroEstetico: "ugc_real",
  sujeto: "A woman in her thirties",
  personajeReal: true,
  escena: "In a bright kitchen",
  instruccionesExtra: "",
  modoExperto: false,
  descripcionExperta: "",
  anclajes: "",
  microaccion: "She nods",
  momentoMicroaccion: "durante",
  dialogo: "Mira lo que he encontrado.",
  direccionVocal: "",
  ejesVoz: EJES_VOZ_POR_DEFECTO,
  acento: "es_ES_madrid",
  segundos: 8,
};

const SEIS_C: SeisC = {
  personaje: "A woman in her thirties",
  personajeReal: true,
  atractivoElegido: false,
  plano: "Medium shot",
  angulo: "Eye level",
  optica: "35mm",
  ropa: "A grey jumper",
  localizacion: "A bright kitchen",
  contextoLibre: "",
  luz: "Soft window light",
  accion: "She holds the jar",
  registroEstetico: "ugc_real",
  anclajes: "",
};

describe("el producto en el prompt del clip", () => {
  test("la acción va en su sitio y la etiqueta se protege antes de la toma única", () => {
    const { escena } = dirigirClip({ ...DIRECCION, producto: PRODUCTO });
    const sujeto = escena.indexOf("A woman in her thirties");
    const accion = escena.indexOf("turns the product towards the camera");
    const etiqueta = escena.indexOf("must not be redesigned");
    const tomaUnica = escena.indexOf("Single continuous take");
    // El producto va con el sujeto, y su regla después de todo el catálogo. La toma única cierra siempre.
    expect(sujeto).toBeLessThan(accion);
    expect(accion).toBeLessThan(etiqueta);
    expect(etiqueta).toBeLessThan(tomaUnica);
    expect(escena.trim().endsWith(".")).toBe(true);
    expect(escena.indexOf("Single continuous take")).toBe(escena.lastIndexOf("Single continuous take"));
  });

  test("sin fotos que enviar se le pide un envase sin marca en lugar de prometerle una foto", () => {
    const { escena } = dirigirClip({ ...DIRECCION, producto: { ...PRODUCTO, conReferencias: false } });
    expect(escena).toContain("no invented logo");
    expect(escena).not.toContain("The product reference images show the product");
  });

  test("el plano del producto solo sale sin nadie, mudo, y avisa de que el guion no viaja", () => {
    const { escena, dialogo, avisos } = dirigirClip({
      ...DIRECCION,
      producto: { ...PRODUCTO, soloProducto: true },
    });
    expect(escena).toContain("no person and no hands in frame");
    expect(escena).not.toContain("A woman in her thirties");
    expect(escena).toContain("mouth stays closed");
    // El gesto tampoco viaja: no hay nadie que pueda hacerlo.
    expect(escena).not.toContain("She nods");
    expect(dialogo).toBe("");
    expect(avisos.join(" ")).toContain("no sale nadie que pueda hablar");
  });

  test("sin producto el prompt es exactamente el de antes de esta versión", () => {
    const { escena } = dirigirClip(DIRECCION);
    expect(escena).not.toContain("must not be redesigned");
    expect(escena).toContain("A woman in her thirties");
  });
});

describe("el producto en las seis C del fotograma", () => {
  test("va entre la acción y los anclajes, que siguen cerrando", () => {
    const prompt = componerSeisC({ ...SEIS_C, producto: PRODUCTO });
    const accion = prompt.indexOf("Action:");
    const producto = prompt.indexOf("Product:");
    const realismo = prompt.indexOf("Realism:");
    expect(accion).toBeLessThan(producto);
    expect(producto).toBeLessThan(realismo);
    expect(prompt).toContain("must not be redesigned");
  });

  test("con el producto solo no se describe a ningún personaje ni su ropa", () => {
    const prompt = componerSeisC({ ...SEIS_C, producto: { ...PRODUCTO, soloProducto: true } });
    expect(prompt).not.toContain("Subject:");
    expect(prompt).not.toContain("Wardrobe:");
    expect(prompt).toContain("Product:");
  });
});

describe("reparto de referencias entre el personaje y el producto", () => {
  test("sin producto, todo el cupo es del personaje", () => {
    expect(repartirReferencias(7, 5, 0)).toEqual({ personaje: 5, producto: 0, cabenTodas: true });
  });

  test("con producto se le reserva sitio y el personaje se queda con el resto", () => {
    expect(repartirReferencias(7, 5, 2)).toEqual({ personaje: 5, producto: 2, cabenTodas: true });
  });

  test("cuando no caben todas, se dice: es lo que se avisa antes de pagar", () => {
    expect(repartirReferencias(3, 5, 2)).toEqual({ personaje: 1, producto: 2, cabenTodas: false });
  });

  test("con un solo hueco manda la imagen de partida: sin ella no hay nada que animar", () => {
    expect(repartirReferencias(1, 1, 3)).toEqual({ personaje: 1, producto: 0, cabenTodas: false });
  });
});

const modelo = (id: string, maximoReferencias: number): ModeloVista =>
  ({
    modelo: id,
    nombre: id,
    proveedor: "kie",
    conVoz: true,
    unidad: "vídeo de 8 s",
    parametros: {
      duraciones: [8],
      proporciones: ["9:16"],
      resoluciones: ["720p"],
      formatosReferencia: ["image/png"],
      maximoReferencias,
    },
  }) as unknown as ModeloVista;

describe("las referencias que son fotogramas del clip no son galería", () => {
  test("Veo admite dos imágenes, pero solo una es referencia", () => {
    expect(adaptadorKie.referenciasDeGaleria?.(modelo("veo3_fast", 2))).toBe(1);
  });

  test("Omni acepta las siete como galería", () => {
    expect(adaptadorKie.referenciasDeGaleria?.(modelo("gemini-omni-video", 7))).toBe(7);
  });
});

describe("Omni con producto", () => {
  const contexto = {
    escena: "In a bright kitchen.",
    dialogo: "Mira lo que he encontrado.",
    segundos: 8,
  };

  test("sin referencias cita la identidad registrada y no manda ninguna imagen", () => {
    const entrada = adaptadorKie.montarEntrada(modelo("gemini-omni-video", 7), {
      ...contexto,
      urls: [],
      personajesOmni: ["char_123"],
    });
    expect(entrada.character_ids).toEqual(["char_123"]);
    expect(entrada.image_urls).toBeUndefined();
  });

  /**
   * Con producto mandan las referencias: `character_ids` e `image_urls` son excluyentes, y la escena se
   * genera con las fotos. Es la pérdida de identidad registrada que se avisa antes de cobrar.
   */
  test("con referencias manda la galería y no se cita la identidad registrada", () => {
    const entrada = adaptadorKie.montarEntrada(modelo("gemini-omni-video", 7), {
      ...contexto,
      urls: ["https://tempfile.kie.ai/cara.png", "https://tempfile.kie.ai/bote.png"],
      personajesOmni: ["char_123"],
    });
    expect(entrada.character_ids).toBeUndefined();
    expect(entrada.image_urls).toEqual(["https://tempfile.kie.ai/cara.png", "https://tempfile.kie.ai/bote.png"]);
  });
});
