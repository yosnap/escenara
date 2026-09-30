import { describe, expect, test } from "bun:test";
import type { ModeloElegible } from "@/lib/catalogo";
import { opcionesDeSelectorDeModelo } from "./modelo";

const modelo = (id: string, extra: Partial<ModeloElegible> = {}): ModeloElegible => ({
  modelo: id,
  nombre: id,
  conVoz: true,
  unidad: "vídeo de 4 s",
  estado: "validado",
  creditos: 10,
  precioPublicado: false,
  duracionesConCoste: [{ segundos: 4, creditos: 10, unidad: "vídeo de 4 s", publicado: false }],
  duraciones: [4],
  maximoReferencias: 2,
  ...extra,
});

const VEO = modelo("veo", { admiteFotoDeProducto: false });
const MINIMAX = modelo("minimax", { admiteFotoDeProducto: true, conVoz: false });
const SIN_DATO = modelo("sin-dato");

describe("el selector de modelo con un producto elegido", () => {
  test("cada modelo dice si admite la foto o si el producto viaja solo descrito, sin deshabilitar ninguno", () => {
    const opciones = opcionesDeSelectorDeModelo([VEO, MINIMAX], [], true);
    expect(opciones[0]?.descripcion).toContain("El producto viaja solo descrito");
    expect(opciones[1]?.descripcion).toContain("Admite la foto del producto");
    expect(opciones.some((o) => o.deshabilitada)).toBe(false);
  });

  test("conserva lo que ya decía: coste, estado y voz", () => {
    const descripcion = opcionesDeSelectorDeModelo([MINIMAX], [], true)[0]?.descripcion ?? "";
    expect(descripcion).toContain("por vídeo de 4 s");
    expect(descripcion).toContain("sin voz");
  });

  test("sin producto no cambia nada", () => {
    const con = opcionesDeSelectorDeModelo([VEO, MINIMAX]);
    expect(con.map((o) => o.descripcion).join("")).not.toContain("foto del producto");
    expect(con.map((o) => o.descripcion).join("")).not.toContain("viaja solo descrito");
    expect(opcionesDeSelectorDeModelo([VEO, MINIMAX], [], false)).toEqual(con);
  });

  test("un modelo sin el dato calculado no dice nada de la foto", () => {
    expect(opcionesDeSelectorDeModelo([SIN_DATO], [], true)[0]?.descripcion).not.toContain("producto");
  });

  test("con un trend que no admite el modelo, manda el motivo del trend", () => {
    const [opcion] = opcionesDeSelectorDeModelo([VEO], [6], true);
    expect(opcion?.deshabilitada).toBe(true);
    expect(opcion?.descripcion).toContain("No disponible con este trend");
  });
});
