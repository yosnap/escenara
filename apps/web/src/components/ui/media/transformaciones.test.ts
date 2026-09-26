import { describe, expect, test } from "bun:test";
import { ajustarAMaximo, dimensionesGiradas, girar, nombreEditado, recorteReal } from "./transformaciones";

describe("transformaciones del editor", () => {
  test("girar da la vuelta completa en ambos sentidos", () => {
    expect(girar(0, 1)).toBe(90);
    expect(girar(270, 1)).toBe(0);
    expect(girar(0, -1)).toBe(270);
  });

  test("90° y 270° intercambian las dimensiones", () => {
    expect(dimensionesGiradas({ ancho: 400, alto: 300 }, 90)).toEqual({ ancho: 300, alto: 400 });
    expect(dimensionesGiradas({ ancho: 400, alto: 300 }, 180)).toEqual({ ancho: 400, alto: 300 });
  });

  const lienzo = { ancho: 1000, alto: 500 };

  test("sin recorte ni zoom devuelve el lienzo entero", () => {
    expect(recorteReal(null, lienzo, 1)).toEqual({ x: 0, y: 0, ancho: 1000, alto: 500 });
  });

  test("sin zoom el recorte coincide con el lienzo", () => {
    expect(recorteReal({ x: 100, y: 50, ancho: 200, alto: 100 }, lienzo, 1)).toEqual({
      x: 100,
      y: 50,
      ancho: 200,
      alto: 100,
    });
  });

  test("con zoom 2× toda la vista equivale a la mitad central", () => {
    expect(recorteReal(null, lienzo, 2)).toEqual({ x: 250, y: 125, ancho: 500, alto: 250 });
  });

  test("con zoom el recorte se escala desde el centro", () => {
    expect(recorteReal({ x: 500, y: 250, ancho: 200, alto: 100 }, lienzo, 2)).toEqual({
      x: 500,
      y: 250,
      ancho: 100,
      alto: 50,
    });
  });

  test("nunca se sale del lienzo", () => {
    const r = recorteReal({ x: 900, y: 400, ancho: 400, alto: 300 }, lienzo, 1);
    expect(r.x + r.ancho).toBeLessThanOrEqual(1000);
    expect(r.y + r.alto).toBeLessThanOrEqual(500);
  });

  test("ajustarAMaximo reduce proporcionalmente y no amplía", () => {
    expect(ajustarAMaximo({ ancho: 3840, alto: 2160 }, { ancho: 1920, alto: 1080 })).toEqual({
      ancho: 1920,
      alto: 1080,
    });
    expect(ajustarAMaximo({ ancho: 1000, alto: 3000 }, { ancho: 1920, alto: 1080 })).toEqual({
      ancho: 360,
      alto: 1080,
    });
    expect(ajustarAMaximo({ ancho: 300, alto: 200 }, { ancho: 1920, alto: 1080 })).toEqual({ ancho: 300, alto: 200 });
  });

  test("nombreEditado cambia la extensión y conserva el nombre", () => {
    expect(nombreEditado("playa.final.JPG", "webp")).toBe("playa.final-editada.webp");
    expect(nombreEditado("sin-extension", "png")).toBe("sin-extension-editada.png");
  });
});
