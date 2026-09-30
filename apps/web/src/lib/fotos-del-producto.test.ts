import { describe, expect, test } from "bun:test";
import {
  alternarFoto,
  cupoDeFotosDe,
  type FotoElegible,
  fotosQueCaben,
  fotosQueViajan,
  textoFotosQueCaben,
} from "./fotos-del-producto";

/** Cinco fotos en desorden de papeles: la frontal no está la primera del listado. */
const FOTOS: FotoElegible[] = [
  { medioId: "suelto-1", papel: "suelto", orden: 1 },
  { medioId: "envase", papel: "envase", orden: 2 },
  { medioId: "frontal", papel: "etiqueta", orden: 3 },
  { medioId: "tapa", papel: "mecanismo", orden: 4 },
  { medioId: "suelto-2", papel: "suelto", orden: 5 },
];

describe("cuántas fotos del producto caben", () => {
  test("con Omni y un personaje de seis fotos caben tres; con una sola imagen de partida, seis", () => {
    expect(fotosQueCaben({ cupoDeGaleria: 7, fotosDelPersonaje: 6 }, 5)).toBe(3);
    expect(fotosQueCaben({ cupoDeGaleria: 7, fotosDelPersonaje: 1 }, 8)).toBe(6);
  });

  test("un modelo que solo admite una imagen no deja sitio al producto", () => {
    expect(fotosQueCaben({ cupoDeGaleria: 1, fotosDelPersonaje: 1 }, 5)).toBe(0);
  });

  test("solo se ofrece elegir cuando el servidor ha dicho con qué se produce el clip", () => {
    expect(cupoDeFotosDe(null)).toBeNull();
    expect(cupoDeFotosDe({ cupoDeGaleria: 7 })).toBeNull();
    expect(cupoDeFotosDe({ cupoDeGaleria: 7, fotosDelPersonaje: 1 })).toEqual({
      cupoDeGaleria: 7,
      fotosDelPersonaje: 1,
    });
  });

  test("la frase dice cuántas tiene y cuántas caben", () => {
    expect(textoFotosQueCaben("Caja", 5, 3)).toContain("tiene 5 fotos y en este clip solo caben 3");
  });
});

describe("qué fotos viajan", () => {
  test("por defecto, las primeras por prioridad: la frontal siempre", () => {
    expect(fotosQueViajan(FOTOS, "", 3)).toEqual(["frontal", "envase", "tapa"]);
  });

  test("al abrir el producto, el detalle del mecanismo pasa por delante del envase", () => {
    expect(fotosQueViajan(FOTOS, "abrirlo", 3)).toEqual(["frontal", "tapa", "envase"]);
  });

  test("la elección manda y sale en orden de prioridad, no en el que se marcó", () => {
    expect(fotosQueViajan(FOTOS, "", 3, ["suelto-2", "envase", "frontal"])).toEqual(["frontal", "envase", "suelto-2"]);
  });

  test("una elección que ya no es válida cae a las de por defecto", () => {
    expect(fotosQueViajan(FOTOS, "", 2, ["borrada"])).toEqual(["frontal", "envase"]);
  });

  test("nunca pasa de lo que cabe", () => {
    expect(fotosQueViajan(FOTOS, "", 2, ["frontal", "envase", "tapa"])).toEqual(["frontal", "envase"]);
    expect(fotosQueViajan(FOTOS, "", 0)).toEqual([]);
  });
});

describe("marcar y desmarcar", () => {
  test("marcar añade en orden estable y no pasa del cupo", () => {
    expect(alternarFoto(FOTOS, "", 3, ["frontal", "envase"], "suelto-2")).toEqual(["frontal", "envase", "suelto-2"]);
    expect(alternarFoto(FOTOS, "", 3, ["frontal", "envase", "tapa"], "suelto-2")).toEqual([
      "frontal",
      "envase",
      "tapa",
    ]);
  });

  test("desmarcar quita, pero la última marcada se queda", () => {
    expect(alternarFoto(FOTOS, "", 3, ["frontal", "envase"], "envase")).toEqual(["frontal"]);
    expect(alternarFoto(FOTOS, "", 3, ["frontal"], "frontal")).toEqual(["frontal"]);
  });

  test("se puede cambiar la frontal por otra: se desmarca una y se marca la otra", () => {
    const sinFrontal = alternarFoto(FOTOS, "", 2, ["frontal", "envase"], "frontal");
    expect(alternarFoto(FOTOS, "", 2, sinFrontal, "suelto-1")).toEqual(["envase", "suelto-1"]);
  });
});
