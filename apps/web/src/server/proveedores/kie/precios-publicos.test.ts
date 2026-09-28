import { describe, expect, test } from "bun:test";
import { modeloDeAncla, traducirTarifa, traducirTarifas } from "./correspondencia";
import { familiaDe, unidadDeVariante, varianteDeUnidad } from "./familias";
import { buscadorDePrecios, REGISTROS_DE_PRECIO } from "./grabaciones-precios";
import { descargarTarifas, recuentoDeTarifas } from "./precios-publicos";
import { modelosPublicadosDeKie } from "./publicados";

/**
 * Tabla de precios pública de KIE: descarga, traducción a identificadores de la API y catálogo publicado.
 * **Ningún test sale a la red**: todo sale de las respuestas grabadas de la descarga real del 2026-09-28.
 */

const buscar = () => buscadorDePrecios().buscar;
const tarifa = (descripcion: string) => REGISTROS_DE_PRECIO.find((r) => r.modelDescription.trim() === descripcion);

describe("descarga de la tabla de precios", () => {
  test("lee todas las páginas y descarta lo que no se entiende", async () => {
    const tarifas = await descargarTarifas(buscar());
    expect(tarifas).toHaveLength(REGISTROS_DE_PRECIO.length);
    // El precio llega como cadena y tiene que quedar como número: con él se estima y se reserva.
    expect(tarifas.every((t) => typeof t.creditos === "number" && t.creditos > 0)).toBe(true);
  });

  test("el recuento sale del propio proveedor", async () => {
    expect((await recuentoDeTarifas(buscar())).total).toBe(REGISTROS_DE_PRECIO.length);
  });

  test("una página que no tiene la forma documentada corta la descarga en lugar de inventarse nada", () => {
    const roto = async () =>
      new Response(JSON.stringify({ code: 200, msg: "ok", data: { total: 3 } }), { status: 200 });
    expect(descargarTarifas(roto)).rejects.toThrow();
  });

  test("un precio ausente o cero no se importa: sin precio no se estima ni se gasta", async () => {
    const { buscar: conCero } = buscadorDePrecios(
      REGISTROS_DE_PRECIO.slice(0, 2).map((r, i) => ({ ...r, creditPrice: i === 0 ? "0" : "" })),
    );
    expect(await descargarTarifas(conCero)).toHaveLength(0);
  });
});

describe("de la descripción al identificador de la API", () => {
  test("el parámetro «model» del anclaje es el identificador exacto de createTask", () => {
    expect(modeloDeAncla("https://kie.ai/seedream-4-5?model=seedream%2F4.5-edit")).toBe("seedream/4.5-edit");
  });

  test("una página del market sin «model» se resuelve por su tabla", () => {
    expect(modeloDeAncla("https://kie.ai/nano-banana-2-lite")).toBe("nano-banana-2-lite");
  });

  test("una página desconocida no se adivina: enviar a ciegas cuesta dinero", () => {
    expect(modeloDeAncla("https://kie.ai/un-modelo-que-no-conocemos")).toBeNull();
    expect(modeloDeAncla("")).toBeNull();
  });

  test("la variante sale de la descripción, con su resolución o su calidad", () => {
    const cuatroK = traducirTarifa({
      descripcion: "gpt image 2, image-to-image, 4k",
      interfaz: "image",
      fabricante: "OpenAI",
      creditos: 16,
      unidadPublicada: "per image",
      usd: 0,
      ancla: "https://kie.ai/gpt-image-2?model=gpt-image-2-image-to-image",
    });
    expect(cuatroK).toMatchObject({ modelo: "gpt-image-2-image-to-image", creditos: 16 });
    expect(cuatroK?.variante.resolucion).toBe("4k");
  });

  test("«texto a imagen» no se importa: no genera a partir de una referencia", () => {
    const registro = tarifa("gpt image 2, text-to-image, 1k");
    expect(registro).toBeDefined();
    const traducidas = traducirTarifas([
      {
        descripcion: registro?.modelDescription ?? "",
        interfaz: "image",
        fabricante: "OpenAI",
        creditos: 6,
        unidadPublicada: "per image",
        usd: 0,
        ancla: registro?.anchor ?? "",
      },
    ]);
    expect(traducidas).toHaveLength(0);
  });

  test("un recargo por imagen de entrada no es el precio de generar", () => {
    for (const descripcion of ["seedream 5 Pro, input image, First image free", "MiniMax H3, image input, 768p, 2k"]) {
      const traducida = traducirTarifa({
        descripcion,
        interfaz: descripcion.startsWith("MiniMax") ? "video" : "image",
        fabricante: "",
        creditos: 4,
        unidadPublicada: "per image",
        usd: 0,
        ancla: "https://kie.ai/minimax-h3",
      });
      expect(traducida).toBeNull();
    }
  });
});

describe("la unidad y la variante son la misma cosa vista de dos formas", () => {
  test("ida y vuelta entre variante y unidad", () => {
    for (const variante of [
      { resolucion: "2K", calidad: "" },
      { resolucion: "", calidad: "BALANCED" },
      { resolucion: "", calidad: "" },
    ]) {
      expect(varianteDeUnidad(unidadDeVariante(variante))).toEqual(variante);
    }
  });

  test("ninguna unidad lleva «@v» dentro: el sello parte por ahí", () => {
    const familia = familiaDe("gpt-image-2-image-to-image");
    expect(familia).toBeDefined();
    for (const variante of familia?.variantes ?? []) {
      expect(unidadDeVariante(variante)).not.toContain("@v");
    }
  });
});

describe("catálogo publicado", () => {
  test("un modelo con familia sale montable, con una tarifa por variante y la más barata primero", async () => {
    const publicados = await modelosPublicadosDeKie(buscar());
    const gpt = publicados.find((p) => p.modelo === "gpt-image-2-image-to-image");
    expect(gpt?.montable).toBe(true);
    expect(gpt?.capacidades).toEqual(["image_edit"]);
    expect(gpt?.tarifas.map((t) => [t.unidad, t.creditos])).toEqual([
      ["imagen a 1K", 6],
      ["imagen a 2K", 10],
      ["imagen a 4K", 16],
    ]);
  });

  test("un modelo sin familia se ve pero no es montable, y dice por qué", async () => {
    const publicados = await modelosPublicadosDeKie(buscar());
    const sinFamilia = publicados.find((p) => !p.montable);
    expect(sinFamilia).toBeDefined();
    expect(sinFamilia?.notas).toContain("no sabe con qué parámetros");
  });

  test("los precios de chat no entran: se cobran por tokens y no se saben antes de generar", async () => {
    const publicados = await modelosPublicadosDeKie(buscar());
    expect(publicados.some((p) => p.modelo === "gpt-6-luna")).toBe(false);
  });

  test("la tarifa publicada coincide con lo que se midió con dinero real", async () => {
    const publicados = await modelosPublicadosDeKie(buscar());
    // Medido el 2026-09-27: `nano-banana-2-lite` costó 4 créditos por imagen.
    const nano = publicados.find((p) => p.modelo === "nano-banana-2-lite");
    expect(nano?.tarifas[0]?.creditos).toBe(4);
  });
});
