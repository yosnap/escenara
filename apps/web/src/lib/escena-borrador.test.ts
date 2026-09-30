import { describe, expect, test } from "bun:test";
import { borradorDe, escenaConCambios, motivoCambiosSinGuardar } from "./escena-borrador";
import { PRODUCTO_ELEGIDO_VACIO } from "./productos";
import { DIRECCION_SIN_ELEGIR, type EscenaVista } from "./proyectos";

const ESCENA = {
  id: "e1",
  texto: "Hola",
  accion: "Saluda",
  direccion: DIRECCION_SIN_ELEGIR,
  producto: PRODUCTO_ELEGIDO_VACIO,
  trendId: null,
} as unknown as EscenaVista;

describe("cambios sin guardar de una escena", () => {
  test("lo guardado no tiene cambios, aunque las claves lleguen en otro orden", () => {
    expect(escenaConCambios(ESCENA, borradorDe(ESCENA))).toBe(false);
    const reordenada = Object.fromEntries(Object.entries(DIRECCION_SIN_ELEGIR).reverse());
    expect(
      escenaConCambios(ESCENA, { ...borradorDe(ESCENA), direccion: reordenada as typeof DIRECCION_SIN_ELEGIR }),
    ).toBe(false);
  });

  test("texto, acción, dirección, producto o trend distintos son cambios", () => {
    const b = borradorDe(ESCENA);
    expect(escenaConCambios(ESCENA, { ...b, texto: "Adiós" })).toBe(true);
    expect(escenaConCambios(ESCENA, { ...b, accion: "Se va" })).toBe(true);
    expect(escenaConCambios(ESCENA, { ...b, trendId: "t1" })).toBe(true);
    expect(escenaConCambios(ESCENA, { ...b, producto: { ...b.producto, productoId: "p1" } })).toBe(true);
    const clave = Object.keys(DIRECCION_SIN_ELEGIR)[0] as keyof typeof DIRECCION_SIN_ELEGIR;
    expect(escenaConCambios(ESCENA, { ...b, direccion: { ...b.direccion, [clave]: "otra" } })).toBe(true);
  });
});

describe("motivo de los cambios sin guardar", () => {
  test("sin cambios no hay motivo", () => {
    expect(motivoCambiosSinGuardar(false, 0)).toBeNull();
  });

  test("dice qué está pendiente y qué pasaría al aprobar", () => {
    expect(motivoCambiosSinGuardar(true, 0)).toContain("(el orden de las escenas)");
    expect(motivoCambiosSinGuardar(false, 1)).toContain("(una escena editada)");
    const ambos = motivoCambiosSinGuardar(true, 2) ?? "";
    expect(ambos).toContain("(el orden de las escenas y 2 escenas editadas)");
    expect(ambos).toContain("se aprobaría el guion guardado");
  });
});
