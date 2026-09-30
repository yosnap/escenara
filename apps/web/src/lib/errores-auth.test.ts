import { describe, expect, test } from "bun:test";
import { mensajeError, rutaSegura } from "./errores-auth";

describe("errores de cuenta", () => {
  test("traduce los códigos conocidos y el exceso de intentos", () => {
    expect(mensajeError({ code: "INVALID_EMAIL_OR_PASSWORD" })).toContain("contraseña");
    expect(mensajeError({ status: 429 })).toContain("Demasiados intentos");
    expect(mensajeError({ code: "DESCONOCIDO" })).toContain("Inténtalo");
  });

  test("solo acepta rutas internas para volver", () => {
    expect(rutaSegura("/admin/componentes")).toBe("/admin/componentes");
    expect(rutaSegura("https://malo.example")).toBe("/cuenta");
    expect(rutaSegura("//malo.example")).toBe("/cuenta");
    expect(rutaSegura("/\\malo.example")).toBe("/cuenta");
    // El navegador elimina tabuladores y saltos de línea antes de interpretar la URL.
    expect(rutaSegura("/\t//malo.example")).toBe("/cuenta");
    expect(rutaSegura("/\n\\malo.example")).toBe("/cuenta");
    expect(rutaSegura("/\r\\malo.example")).toBe("/cuenta");
    expect(rutaSegura("/cuenta?x=1#y")).toBe("/cuenta?x=1#y");
    expect(rutaSegura(null, "/")).toBe("/");
  });
});

describe("sesión antigua", () => {
  test("se explica con qué hacer, venga como código o solo como texto", () => {
    const esperado = mensajeError({ code: "SESSION_NOT_FRESH" });
    expect(esperado).toContain("vuelve a entrar");
    expect(mensajeError({ message: "Session is not fresh" })).toBe(esperado);
  });
});
