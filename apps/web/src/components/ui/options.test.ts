import { describe, expect, test } from "bun:test";
import { clasePopup } from "./options";

describe("el popup de los selectores", () => {
  test("nunca pasa del hueco disponible ni del mayor entre su campo y 28 rem", () => {
    // Sin tope, una descripción larga lo estiraba hasta salirse del formulario.
    expect(clasePopup).toContain("min-w-(--anchor-width)");
    expect(clasePopup).toContain("max-w-[min(var(--available-width),max(var(--anchor-width),28rem))]");
  });
});
