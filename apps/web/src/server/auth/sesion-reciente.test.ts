import { describe, expect, test } from "bun:test";
import { conSesionReciente, esSesionAntigua } from "./sesion-reciente";

describe("sesión antigua", () => {
  test("se reconoce por código o por texto, y no se confunde con otros errores", () => {
    expect(esSesionAntigua({ body: { code: "SESSION_NOT_FRESH" } })).toBe(true);
    expect(esSesionAntigua({ message: "Session is not fresh" })).toBe(true);
    expect(esSesionAntigua({ body: { message: "Session is not fresh" } })).toBe(true);
    expect(esSesionAntigua(new Error("Unauthorized"))).toBe(false);
    expect(esSesionAntigua(null)).toBe(false);
  });

  test("devuelve «antigua» en lugar de lanzar y deja pasar el resto de errores", async () => {
    expect(await conSesionReciente(async () => 7)).toEqual({ antigua: false, valor: 7 });
    expect(
      await conSesionReciente(async () => {
        throw { body: { code: "SESSION_NOT_FRESH" } };
      }),
    ).toEqual({ antigua: true });
    await expect(
      conSesionReciente(async () => {
        throw new Error("otra cosa");
      }),
    ).rejects.toThrow("otra cosa");
  });
});
