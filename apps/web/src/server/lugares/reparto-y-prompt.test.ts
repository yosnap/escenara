import { describe, expect, test } from "bun:test";
import { repartirReferencias } from "@/lib/reparto-referencias";
import type { Hechos } from "../controles/contrato";
import { evaluar } from "../controles/motor";
import { dirigirClip } from "../direccion/clip";
import { componerSeisC, type SeisC } from "../direccion/fotograma";
import type { LugarEnPrompt } from "../direccion/lugar";
import { acabadoDistinto, hechosDelLugar, type LugarParaGenerar } from "./para-generar";

/**
 * Pruebas puras del lugar: el reparto a tres bandas (la única cuenta que comparten el aviso, el envío y el worker),
 * el ancla C4 del fotograma, el plano del lugar solo y las reglas del motor. Sin base de datos ni proveedor.
 */

describe("reparto de referencias a tres bandas", () => {
  // [cupo, fotos del personaje, fotos del producto, ¿lugar?, se envían del personaje, del producto, del lugar, caben todas]
  const TABLA: [number, number, number, number, number, number, number, boolean][] = [
    // Sin lugar, exactamente lo de siempre.
    [10, 6, 8, 0, 6, 4, 0, false],
    // Con lugar, la maestra se lleva un hueco y el resto se reparte 3/7 entre el personaje y el producto.
    [10, 6, 8, 1, 6, 3, 1, false],
    [10, 3, 2, 1, 3, 2, 1, true],
    [7, 6, 5, 1, 4, 2, 1, false],
    // Sin producto: personaje y maestra.
    [10, 4, 0, 1, 4, 0, 1, true],
    [2, 4, 0, 1, 1, 0, 1, false],
    // Con tres huecos caben uno de cada.
    [3, 4, 3, 1, 1, 1, 1, false],
    // Con dos huecos y los tres pidiendo, la maestra es la que se queda fuera: personaje y producto primero.
    [2, 4, 3, 1, 1, 1, 0, false],
    // Con una imagen manda la del personaje.
    [1, 4, 0, 1, 1, 0, 0, false],
    [1, 4, 3, 1, 1, 0, 0, false],
    // Producto sobre una superficie del lugar, sin nadie: producto primero, maestra si cabe.
    [2, 0, 3, 1, 0, 1, 1, false],
    [1, 0, 3, 1, 0, 1, 0, false],
    // El plano del lugar solo por referencia (sin nadie y sin producto): la maestra ocupa la única imagen.
    [1, 0, 0, 1, 0, 0, 1, true],
    // Un modelo sin referencias no envía nada.
    [0, 2, 2, 1, 0, 0, 0, false],
    [0, 0, 0, 0, 0, 0, 0, true],
  ];
  for (const [cupo, personaje, producto, lugar, ...esperado] of TABLA) {
    test(`cupo ${cupo}, personaje ${personaje}, producto ${producto}, lugar ${lugar}`, () => {
      const [ePersonaje, eProducto, eLugar, eCaben] = esperado;
      expect(repartirReferencias(cupo, personaje, producto, lugar)).toEqual({
        personaje: ePersonaje,
        producto: eProducto,
        lugar: eLugar,
        cabenTodas: eCaben,
      });
    });
  }

  test("en todas las combinaciones: nunca se pasa del cupo, el personaje y el producto tienen su hueco antes que la maestra", () => {
    for (const cupo of [0, 1, 2, 3, 4, 5, 7, 9, 10]) {
      for (const personaje of [0, 1, 2, 6]) {
        for (const producto of [0, 1, 3, 8]) {
          for (const lugar of [0, 1]) {
            const r = repartirReferencias(cupo, personaje, producto, lugar);
            expect(r.personaje + r.producto + r.lugar).toBeLessThanOrEqual(Math.max(0, cupo));
            if (cupo >= 1 && personaje > 0) expect(r.personaje).toBeGreaterThanOrEqual(1);
            if (cupo >= (personaje > 0 ? 2 : 1) && producto > 0) expect(r.producto).toBeGreaterThanOrEqual(1);
            const minimos = (personaje > 0 ? 1 : 0) + (producto > 0 ? 1 : 0);
            expect(r.lugar).toBe(lugar > 0 && cupo >= minimos + 1 ? 1 : 0);
            // Sin lugar el reparto es idéntico al de dos bandas de siempre.
            if (lugar === 0) expect(r).toEqual({ ...repartirReferencias(cupo, personaje, producto), lugar: 0 });
            expect(r.cabenTodas).toBe(r.personaje >= personaje && r.producto >= producto && r.lugar >= lugar);
          }
        }
      }
    }
  });
});

const SEIS_C: SeisC = {
  personaje: "",
  personajeReal: true,
  atractivoElegido: false,
  plano: "Medium shot",
  angulo: "Eye level",
  optica: "",
  ropa: "Denim jacket",
  localizacion: "PRESET-LOCATION-FRAGMENT",
  contextoLibre: "She smiles at the camera",
  luz: "Window light",
  accion: "Holds a cup",
  registroEstetico: "ugc_real",
  anclajes: "",
};

const LUGAR: LugarEnPrompt = {
  descripcion: "Neighbourhood bar with green tiles",
  sitio: "behind the bar",
  conReferencia: true,
  soloLugar: false,
};

describe("el lugar en las seis C del fotograma", () => {
  test("sin lugar el prompt es exactamente el de siempre", () => {
    expect(componerSeisC({ ...SEIS_C, lugar: null })).toBe(componerSeisC(SEIS_C));
    expect(componerSeisC(SEIS_C)).toContain("PRESET-LOCATION-FRAGMENT");
  });

  test("con lugar, C4 es la maestra, su descripción y el «dónde», y el preset de localización no entra", () => {
    const prompt = componerSeisC({ ...SEIS_C, lugar: LUGAR });
    expect(prompt).not.toContain("PRESET-LOCATION-FRAGMENT");
    expect(prompt).toContain("The setting is the place shown in the last reference image");
    expect(prompt).toContain("The place: Neighbourhood bar with green tiles");
    expect(prompt).toContain("Position within the place: behind the bar");
    expect(prompt).toContain("take the setting from it and nothing else");
    // C1, C3 y la regla de no retocar a una persona real siguen igual.
    expect(prompt).toContain("Subject:");
    expect(prompt).toContain("Wardrobe: Denim jacket");
    expect(prompt.split("\n").at(-1)).toContain("Realism:");
  });

  test("si la maestra no cabe, el lugar va descrito y no se promete ninguna imagen", () => {
    const prompt = componerSeisC({ ...SEIS_C, lugar: { ...LUGAR, conReferencia: false } });
    const contexto = prompt.split("\n").find((linea) => linea.startsWith("Context:")) ?? "";
    expect(contexto).not.toContain("reference image");
    expect(prompt).toContain("The setting is one specific place, described here");
  });

  test("el plano del lugar solo no describe a nadie, ni ropa, ni la regla de retoque de una persona", () => {
    const conPersona = componerSeisC({ ...SEIS_C, lugar: LUGAR });
    const solo = componerSeisC({ ...SEIS_C, lugar: { ...LUGAR, soloLugar: true } });
    expect(solo).toContain("Subject: Nobody. The place itself is the subject");
    expect(solo).not.toContain("Wardrobe:");
    expect(solo).toContain("the place shown in the reference image");
    expect(solo).not.toContain("the last reference image");
    expect(conPersona.length).toBeGreaterThan(0);
  });

  test("el clip del plano del lugar solo sale mudo aunque la escena tenga guion", () => {
    const clip = dirigirClip({
      formato: "ugc_a_camara",
      movimientosCamara: [],
      nivelCamara: "basico",
      plano: "Wide shot",
      angulo: "",
      registroEstetico: "ugc_real",
      sujeto: "A woman",
      personajeReal: true,
      microaccion: "Smiles",
      momentoMicroaccion: "durante",
      direccionVocal: "",
      modoExperto: false,
      instruccionesExtra: "",
      descripcionExperta: "",
      anclajes: "",
      ejesVoz: { genero: "", edad: "", gravedad: "", textura: "", entrega: "" } as never,
      acento: "es_ES_madrid",
      escena: "The bar at opening time",
      dialogo: "Bienvenidos al bar",
      segundos: 6,
      soloLugar: true,
    });
    expect(clip.dialogo).toBe("");
    expect(clip.escena).not.toContain("A woman");
  });
});

const lugarDePrueba = (cambios: Partial<LugarParaGenerar> = {}): LugarParaGenerar => ({
  id: "00000000-0000-4000-8000-000000000001",
  nombre: "Bar",
  version: 2,
  maestraId: "00000000-0000-4000-8000-000000000002",
  descripcionOriginal: "",
  sitioOriginal: "",
  acabado: "realista",
  guia: { preset: "", prompt: "", paleta: "", trazo: "", detalle: "", referencias: [] },
  declarado: true,
  declaracionId: null,
  soloLugar: false,
  ...cambios,
});

describe("reglas del lugar en el motor", () => {
  const base = (lugar: ReturnType<typeof hechosDelLugar>): Hechos =>
    ({ tipo: "fotograma", parametros: { exigirPrecioFresco: false }, lugar }) as unknown as Hechos;

  test("sin declaración vigente, bloqueado y sin poder confirmarlo", () => {
    const evaluacion = evaluar(base(hechosDelLugar(lugarDePrueba({ declarado: false }), null, 1)));
    const freno = evaluacion.frenos.find((f) => f.regla === "lugar-sin-declaracion");
    expect(freno?.estado).toBe("bloqueado");
    expect(freno?.confirmable).toBe(false);
  });

  test("acabado distinto del proyecto o de otro estilo: bloqueado con la causa", () => {
    const esperado = { acabado: "animado" as const, estilo: "anime", de: "el proyecto" };
    expect(acabadoDistinto(lugarDePrueba(), esperado)).toContain("no se mezclan acabados");
    const animado = lugarDePrueba({
      acabado: "animado",
      guia: { ...lugarDePrueba().guia, preset: "ilustracion-plana" },
    });
    expect(acabadoDistinto(animado, esperado)).toContain("otro estilo animado");
    expect(acabadoDistinto(animado, { ...esperado, estilo: "ilustracion-plana" })).toBe("");
    const evaluacion = evaluar(base(hechosDelLugar(lugarDePrueba(), esperado, 1)));
    expect(evaluacion.frenos.find((f) => f.regla === "lugar-acabado-distinto")?.estado).toBe("bloqueado");
  });

  test("la maestra que no cabe es un aviso confirmable; sin maestra en el plano solo, bloqueado", () => {
    const noCabe = evaluar(base(hechosDelLugar(lugarDePrueba(), null, 0)));
    const aviso = noCabe.frenos.find((f) => f.regla === "lugar-maestra-no-cabe");
    expect(aviso?.estado).toBe("ajustes");
    expect(aviso?.confirmable).toBe(true);
    const soloSinMaestra = evaluar(
      base(hechosDelLugar(lugarDePrueba({ maestraId: null, soloLugar: true }), null, null)),
    );
    expect(soloSinMaestra.frenos.find((f) => f.regla === "lugar-solo-sin-maestra")?.estado).toBe("bloqueado");
  });
});
