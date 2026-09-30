import { describe, expect, test } from "bun:test";
import type { ModeloVista } from "@/lib/catalogo";
import { EJES_VOZ_POR_DEFECTO } from "@/lib/direccion";
import { type DireccionDeClip, dirigirClip } from "../direccion/clip";
import { componerSeisC, type SeisC } from "../direccion/fotograma";
import type { ProductoEnPrompt } from "../direccion/producto";
import { adaptadorKie } from "../proveedores/kie/adaptador";
import { hechosDelProducto, type ProductoParaGenerar } from "./prompt";
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
    expect(repartirReferencias(7, 9, 0)).toEqual({ personaje: 7, producto: 0, cabenTodas: false });
  });

  test("sin personaje, todo el cupo es del producto", () => {
    expect(repartirReferencias(7, 0, 5)).toEqual({ personaje: 0, producto: 5, cabenTodas: true });
    expect(repartirReferencias(7, 0, 9)).toEqual({ personaje: 0, producto: 7, cabenTodas: false });
  });

  test("con siete huecos, cuatro son del personaje y tres del producto", () => {
    expect(repartirReferencias(7, 6, 5)).toEqual({ personaje: 4, producto: 3, cabenTodas: false });
    expect(repartirReferencias(7, 4, 3)).toEqual({ personaje: 4, producto: 3, cabenTodas: true });
  });

  test("lo que uno no usa lo aprovecha el otro", () => {
    // El personaje solo tiene una foto: el producto se lleva el resto del cupo.
    expect(repartirReferencias(7, 1, 5)).toEqual({ personaje: 1, producto: 5, cabenTodas: true });
    // El producto solo tiene una: el personaje se lleva el resto.
    expect(repartirReferencias(7, 6, 1)).toEqual({ personaje: 6, producto: 1, cabenTodas: true });
  });

  test("con dos huecos, uno para cada uno; con uno solo, manda la imagen de partida", () => {
    expect(repartirReferencias(2, 4, 3)).toEqual({ personaje: 1, producto: 1, cabenTodas: false });
    expect(repartirReferencias(1, 1, 3)).toEqual({ personaje: 1, producto: 0, cabenTodas: false });
  });

  test("un modelo sin referencias no envía nada, y solo avisa si había algo que enviar", () => {
    expect(repartirReferencias(0, 2, 2)).toEqual({ personaje: 0, producto: 0, cabenTodas: false });
    expect(repartirReferencias(0, 0, 0)).toEqual({ personaje: 0, producto: 0, cabenTodas: true });
    expect(repartirReferencias(-1, 1, 1)).toEqual({ personaje: 0, producto: 0, cabenTodas: false });
  });

  // [cupo, fotos del personaje, fotos del producto, se envían del personaje, se envían del producto]
  const TABLA: [number, number, number, number, number][] = [
    [2, 1, 1, 1, 1],
    [2, 2, 5, 1, 1],
    [2, 4, 3, 1, 1],
    [3, 1, 5, 1, 2],
    [3, 4, 3, 2, 1],
    [3, 2, 1, 2, 1],
    [4, 4, 3, 3, 1],
    [4, 2, 5, 2, 2],
    [4, 1, 1, 1, 1],
    [7, 1, 3, 1, 3],
    [7, 2, 3, 2, 3],
    [7, 2, 5, 2, 5],
    [7, 4, 1, 4, 1],
    [7, 4, 3, 4, 3],
    [7, 4, 5, 4, 3],
    [7, 6, 3, 4, 3],
    [7, 6, 5, 4, 3],
    [9, 1, 5, 1, 5],
    [9, 2, 3, 2, 3],
    [9, 4, 5, 4, 5],
    [9, 4, 1, 4, 1],
    [9, 6, 1, 6, 1],
    [9, 6, 3, 6, 3],
    [9, 6, 5, 6, 3],
  ];
  for (const [cupo, delPersonaje, delProducto, enviaPersonaje, enviaProducto] of TABLA) {
    test(`cupo ${cupo}, personaje ${delPersonaje}, producto ${delProducto}: ${enviaPersonaje} y ${enviaProducto}`, () => {
      expect(repartirReferencias(cupo, delPersonaje, delProducto)).toEqual({
        personaje: enviaPersonaje,
        producto: enviaProducto,
        cabenTodas: enviaPersonaje >= delPersonaje && enviaProducto >= delProducto,
      });
    });
  }

  test("nunca supera el cupo, nunca deja un hueco sin usar si hay fotos y siempre cabe una de cada desde dos huecos", () => {
    for (let cupo = 2; cupo <= 12; cupo++) {
      for (let personaje = 1; personaje <= 8; personaje++) {
        for (let producto = 1; producto <= 8; producto++) {
          const r = repartirReferencias(cupo, personaje, producto);
          expect(r.personaje + r.producto).toBe(Math.min(cupo, personaje + producto));
          expect(r.personaje).toBeGreaterThanOrEqual(1);
          expect(r.producto).toBeGreaterThanOrEqual(1);
          expect(r.personaje).toBeLessThanOrEqual(personaje);
          expect(r.producto).toBeLessThanOrEqual(producto);
        }
      }
    }
  });
});

describe("los hechos del producto llevan las cifras del reparto", () => {
  const caja = (fotos: number): ProductoParaGenerar => ({
    id: "p1",
    nombre: "Caja Huerta Valenciana",
    descripcionOriginal: "",
    accion: "",
    nombreAccion: "",
    claveAccion: "",
    soloProducto: false,
    tipo: "fisico",
    pasoDigital: null,
    sinHabla: false,
    pocoFiable: false,
    marcaVisible: false,
    fotos: Array.from({ length: fotos }, (_, i) => `foto-${i + 1}`),
  });

  test("con una caja de cinco fotos y siete huecos, viajan cuatro del personaje y tres del producto", () => {
    const { hechos, reparto } = hechosDelProducto(caja(5), 7, 6, false);
    expect(reparto).toEqual({ personaje: 4, producto: 3, cabenTodas: false });
    expect(hechos.referenciasNoCaben).toBe(true);
    expect(hechos.referencias).toEqual({ cupo: 7, fotosPersonaje: 6, fotosProducto: 5, personaje: 4, producto: 3 });
  });

  test("si caben todas no hay aviso", () => {
    expect(hechosDelProducto(caja(3), 7, 4, false).hechos.referenciasNoCaben).toBe(false);
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

// ── Producto digital y acciones especiales (0.26.0, bloque 3) ────────────────────────────────────────────

describe("el producto digital, en sus dos pasos", () => {
  test("con la pantalla apagada no se le pide la interfaz ni se le promete ninguna foto", () => {
    const prompt = componerSeisC({
      ...SEIS_C,
      producto: { ...PRODUCTO, pasoDigital: "pantalla_negra", conReferencias: false },
    });
    expect(prompt).toContain("screen is completely black and switched off");
    // La acción del catálogo no viaja: pelearía con lo único que este paso tiene que conseguir.
    expect(prompt).not.toContain("turns the product towards the camera");
    // Y no se le promete una referencia ni se le pide un envase sin marca: la captura llega en el paso 2.
    expect(prompt).not.toContain("no invented logo");
    expect(prompt).not.toContain("reference images show the product");
  });

  test("al insertar la captura se pide cambiar solo la pantalla, con perspectiva y sin recortar", () => {
    const prompt = componerSeisC({ ...SEIS_C, producto: { ...PRODUCTO, pasoDigital: "insertar_captura" } });
    expect(prompt).toContain("change only what is inside the black screen");
    expect(prompt).toContain("the same perspective and tilt as the device");
    expect(prompt).toContain("complete and uncropped");
    // Es una edición: no se vuelve a describir a la persona, ni la ropa, ni el sitio.
    expect(prompt).not.toContain("A woman in her thirties");
    expect(prompt).not.toContain("A grey jumper");
    // Y la interfaz es la etiqueta de un producto digital: tampoco se reescribe.
    expect(prompt).toContain("every printed word exactly as they are");
  });
});

describe("las acciones sin habla", () => {
  const SIN_HABLA: ProductoEnPrompt = {
    ...PRODUCTO,
    accion: "The person walks straight towards the camera with a steady runway walk",
    sinHabla: true,
  };

  test("el guion no viaja, se dice por qué, y el clip no prohíbe el audio", () => {
    const { escena, dialogo, avisos } = dirigirClip({ ...DIRECCION, producto: SIN_HABLA });
    expect(dialogo).toBe("");
    expect(avisos.some((a) => a.includes("plano visual"))).toBe(true);
    // Lo que sí se describe: dónde está su atención y qué se oye del sitio.
    expect(escena).toContain("natural room tone");
    // Y lo que no se dice nunca: nada que prohíba el audio. Prohibírselo hace fallar a estos modelos.
    for (const prohibicion of ["no audio", "no sound", "no music", "silence", "mute"]) {
      expect(escena.toLowerCase()).not.toContain(prohibicion);
    }
  });

  test("con una acción que sí habla, el clip sigue llevando la voz y la frase", () => {
    const { escena, dialogo } = dirigirClip({ ...DIRECCION, producto: PRODUCTO });
    expect(dialogo).toBe("Mira lo que he encontrado.");
    expect(escena).toContain("The voice is");
  });
});
