import { describe, expect, test } from "bun:test";
import type { ModeloElegible } from "./catalogo";
import {
  avisoFotoDeProducto,
  ETIQUETA_ADMITE_FOTO_PRODUCTO,
  ETIQUETA_SOLO_DESCRITO_PRODUCTO,
  etiquetaFotoDeProducto,
  fotoDeProductoDelModelo,
  modelosQueAdmitenLaFoto,
} from "./foto-de-producto";

const modelo = (id: string, admite?: boolean): ModeloElegible => ({
  modelo: id,
  nombre: id.toUpperCase(),
  conVoz: true,
  unidad: "vídeo",
  estado: "validado",
  creditos: 10,
  precioPublicado: false,
  duracionesConCoste: [],
  duraciones: [],
  maximoReferencias: 2,
  ...(admite === undefined ? {} : { admiteFotoDeProducto: admite }),
});

const VEO = modelo("veo", false);
const MINIMAX = modelo("minimax", true);
const KLING = modelo("kling", true);

describe("qué modelos admiten la foto del producto", () => {
  test("se listan por nombre y en el orden del catálogo", () => {
    expect(modelosQueAdmitenLaFoto([VEO, MINIMAX, KLING])).toEqual(["MINIMAX", "KLING"]);
    expect(modelosQueAdmitenLaFoto([VEO])).toEqual([]);
  });

  test("un modelo sin el dato calculado no cuenta como admitido", () => {
    expect(modelosQueAdmitenLaFoto([modelo("sin-dato"), MINIMAX])).toEqual(["MINIMAX"]);
  });
});

describe("el estado del modelo elegido", () => {
  test("si no la admite, trae las alternativas", () => {
    expect(fotoDeProductoDelModelo([VEO, MINIMAX, KLING], "veo")).toEqual({
      modelo: "VEO",
      admite: false,
      alternativas: ["MINIMAX", "KLING"],
    });
  });

  test("si la admite, no hay nada que sugerir", () => {
    expect(fotoDeProductoDelModelo([VEO, MINIMAX], "minimax")).toEqual({
      modelo: "MINIMAX",
      admite: true,
      alternativas: [],
    });
  });

  test("sin certeza (modelo ausente o sin dato) no se dice nada", () => {
    expect(fotoDeProductoDelModelo([VEO], "otro")).toBeNull();
    expect(fotoDeProductoDelModelo([modelo("sin-dato")], "sin-dato")).toBeNull();
  });
});

describe("el texto", () => {
  test("el aviso dice la causa, el efecto y los modelos que sí la admiten", () => {
    const texto = avisoFotoDeProducto({ modelo: "Veo 3.1 Lite", admite: false, alternativas: ["MiniMax H3", "Kling"] });
    expect(texto).toContain("Veo 3.1 Lite no admite la foto del producto");
    expect(texto).toContain("su etiqueta puede salir distinta");
    expect(texto).toContain("MiniMax H3, Kling");
    expect(texto).toContain("no se cambia solo");
  });

  test("sin alternativas, lo dice y no inventa ninguna", () => {
    const texto = avisoFotoDeProducto({ modelo: "Veo 3.1 Lite", admite: false, alternativas: [] });
    expect(texto).toContain("Hoy no hay ningún modelo activo que la admita");
    expect(texto).not.toContain("Puedes elegir");
  });

  test("cada opción del selector dice si lleva la foto o si el producto viaja descrito", () => {
    expect(etiquetaFotoDeProducto(MINIMAX)).toBe(ETIQUETA_ADMITE_FOTO_PRODUCTO);
    expect(etiquetaFotoDeProducto(VEO)).toBe(ETIQUETA_SOLO_DESCRITO_PRODUCTO);
    expect(etiquetaFotoDeProducto(modelo("sin-dato"))).toBeNull();
  });
});
