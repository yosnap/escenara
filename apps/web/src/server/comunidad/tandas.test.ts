import { describe, expect, test } from "bun:test";
import { conConcurrencia } from "./tandas";

describe("concurrencia acotada", () => {
  test("nunca pasa del máximo a la vez y conserva el orden", async () => {
    let enCurso = 0;
    let pico = 0;
    const r = await conConcurrencia(
      Array.from({ length: 25 }, (_, i) => i),
      4,
      async (i) => {
        enCurso++;
        pico = Math.max(pico, enCurso);
        await Bun.sleep(2 + (i % 3));
        enCurso--;
        return i * 2;
      },
    );
    expect(pico).toBe(4);
    expect(r).toEqual(Array.from({ length: 25 }, (_, i) => i * 2));
  });

  test("lista vacía y errores: devuelve vacío y propaga el fallo", async () => {
    expect(await conConcurrencia([], 4, async () => 1)).toEqual([]);
    await expect(
      conConcurrencia([1, 2, 3], 2, async (i) => {
        if (i === 2) throw new Error("falla");
        return i;
      }),
    ).rejects.toThrow("falla");
  });
});
