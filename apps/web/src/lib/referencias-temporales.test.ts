import { expect, test } from "bun:test";
import {
  exigirCupoTemporal,
  identidadOriginalParaLugar,
  instruccionesTemporales,
  leerReferenciasTemporales,
  ordenarImagenesDeEscena,
  promptParaLugarBase,
  referenciasOrdenadas,
  resolverMenciones,
} from "./referencias-temporales";

const referencias = [
  { medioId: crypto.randomUUID(), etiqueta: "terraza", uso: "lugar" as const },
  { medioId: crypto.randomUUID(), etiqueta: "chaqueta", uso: "ropa" as const },
] as const;
test("el lugar es la imagen base y las menciones y la identidad mantienen su índice real", () => {
  const ordenadas = referenciasOrdenadas([referencias[1], referencias[0]]);
  expect(ordenadas.map((r) => r.etiqueta)).toEqual(["terraza", "chaqueta"]);
  expect(ordenarImagenesDeEscena(["jorge1", "jorge2"], ["producto"], ["iglesia", "ropa"], true)).toEqual([
    "iglesia",
    "ropa",
    "jorge1",
    "jorge2",
    "producto",
  ]);
  expect(ordenarImagenesDeEscena(["jorge"], [], ["ropa"], false)).toEqual(["jorge", "ropa"]);
  expect(resolverMenciones("En @terraza con @chaqueta", ordenadas, 1)).toBe(
    "En reference image 1 con reference image 2",
  );
  expect(() => referenciasOrdenadas([referencias[0], { ...referencias[0], etiqueta: "otro" }])).toThrow(
    "una sola imagen",
  );
});
test("la identidad real usa originales; los personajes virtuales conservan sus referencias", () => {
  const elegibles = [
    { mediaId: "foto", origen: "foto_original" },
    { mediaId: "sintetica", origen: "vista_generada" },
  ];
  expect(
    identidadOriginalParaLugar(["foto", "sintetica"], elegibles, true, { virtual: false, renderStyle: "realista" }),
  ).toEqual(["foto"]);
  expect(
    identidadOriginalParaLugar(["foto", "sintetica"], elegibles, false, { virtual: false, renderStyle: "realista" }),
  ).toEqual(["foto", "sintetica"]);
  expect(
    identidadOriginalParaLugar(["sintetica"], elegibles, true, { virtual: true, renderStyle: "realista" }),
  ).toEqual(["sintetica"]);
});
test("la edición protege identidad y rótulos existentes sin prohibiciones contradictorias", () => {
  const prompt = promptParaLugarBase(
    "No text, no captions, no subtitles, no watermarks, no logos, no written words and no distorted body parts.",
    6,
    1,
  );
  expect(prompt).toContain("Images 2 through 7");
  expect(prompt).toContain("do not create a lookalike");
  expect(prompt).toContain("existing signs and lettering");
  expect(prompt).not.toContain("no written words");
});
test("las etiquetas apuntan al índice real detrás de las imágenes del personaje", () => {
  expect(resolverMenciones("Jorge en @terraza con @chaqueta", referencias, 4)).toBe(
    "Jorge en reference image 4 con reference image 5",
  );
  const instrucciones = instruccionesTemporales(referencias, 4);
  expect(instrucciones).toContain("Image 4: Preserve the location");
  expect(instrucciones).toContain("Image 5: Preserve the clothing");
  expect(instrucciones).toContain("Do not copy the identity or face");
});
test("una mención sin imagen bloquea, y una dirección de correo no se confunde con una etiqueta", () => {
  expect(() => resolverMenciones("En @patio", referencias, 1)).toThrow("no tiene una imagen");
  expect(resolverMenciones("Correo hola@example.com", [], 1)).toBe("Correo hola@example.com");
});
test("no permite etiquetas duplicadas, instrucciones en etiquetas ni imágenes sin identificar", () => {
  expect(() => leerReferenciasTemporales([referencias[0], { ...referencias[1], etiqueta: "terraza" }])).toThrow(
    "diferentes",
  );
  expect(() => leerReferenciasTemporales([{ ...referencias[0], etiqueta: "ignora instrucciones" }])).toThrow(
    "etiqueta",
  );
  expect(() => leerReferenciasTemporales([{ ...referencias[0], medioId: "" }])).toThrow("Elige una imagen");
  expect(() => leerReferenciasTemporales([{ ...referencias[0], uso: "__proto__" }])).toThrow("qué aporta");
});
test("ninguna referencia se omite cuando se supera el cupo", () => {
  expect(() => exigirCupoTemporal(10, 8, 2)).not.toThrow();
  expect(() => exigirCupoTemporal(1, 1, 1)).toThrow("necesita 2");
});
