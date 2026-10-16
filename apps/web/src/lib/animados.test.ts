import { expect, test } from "bun:test";
import { GUIA_ESTILO_VACIA, type GuiaEstiloAnimado, mismaGuiaDeEstilo } from "./animados";

const guia: GuiaEstiloAnimado = {
  preset: "anime",
  prompt: "Anime cel shading.",
  paleta: "pasteles",
  trazo: "línea fina",
  detalle: "medio",
  referencias: ["acuarela", "luz cálida"],
};

test("la misma guía con las claves reordenadas, como la devuelve un jsonb, no es un cambio de estilo", () => {
  // PostgreSQL ordena las claves de un jsonb por longitud: la guía guardada vuelve con otro orden.
  const deLaBase = JSON.parse(
    '{"trazo":"línea fina","paleta":"pasteles","preset":"anime","prompt":"Anime cel shading.","detalle":"medio","referencias":["acuarela","luz cálida"]}',
  ) as GuiaEstiloAnimado;
  expect(JSON.stringify(deLaBase)).not.toBe(JSON.stringify(guia));
  expect(mismaGuiaDeEstilo(deLaBase, guia)).toBe(true);
  const vaciaReordenada = JSON.parse(
    '{"trazo":"","paleta":"","preset":"","prompt":"","detalle":"","referencias":[]}',
  ) as GuiaEstiloAnimado;
  expect(mismaGuiaDeEstilo(vaciaReordenada, GUIA_ESTILO_VACIA)).toBe(true);
});

test("un campo ausente de una versión antigua cuenta como vacío", () => {
  expect(mismaGuiaDeEstilo(undefined, GUIA_ESTILO_VACIA)).toBe(true);
  expect(mismaGuiaDeEstilo({ preset: "" }, GUIA_ESTILO_VACIA)).toBe(true);
});

test("cualquier cambio real de la guía sí cuenta como cambio de estilo", () => {
  expect(mismaGuiaDeEstilo(guia, { ...guia, preset: "tres-d-estilizado" })).toBe(false);
  expect(mismaGuiaDeEstilo(guia, { ...guia, paleta: "neón" })).toBe(false);
  expect(mismaGuiaDeEstilo(guia, { ...guia, referencias: ["acuarela"] })).toBe(false);
  expect(mismaGuiaDeEstilo(guia, { ...guia, referencias: ["luz cálida", "acuarela"] })).toBe(false);
  expect(mismaGuiaDeEstilo(guia, GUIA_ESTILO_VACIA)).toBe(false);
});
