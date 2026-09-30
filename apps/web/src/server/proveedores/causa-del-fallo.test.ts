import { describe, expect, test } from "bun:test";
import { CAUSAS_FALLO_PROVEEDOR } from "@/lib/causa-fallo";
import { causaDelFallo } from "./causa-del-fallo";

/**
 * La causa del fallo se elige con una lista cerrada. Lo que importa: el caso real de Google se reconoce, las
 * mayúsculas no cambian nada, lo que no se reconoce queda como `desconocida`, y el texto del proveedor (que puede
 * repetir la clave) no sale nunca de la función.
 */
const REAL_GOOGLE = "Request blocked: The generation was blocked by Google safety review.";

describe("causaDelFallo", () => {
  test("el bloqueo real de Gemini Omni por la revisión de seguridad de Google es un bloqueo de seguridad", () => {
    expect(causaDelFallo("400", REAL_GOOGLE)).toBe("bloqueo_seguridad");
  });

  test("las mayúsculas y el tipo del código no cambian la causa", () => {
    expect(causaDelFallo("400", REAL_GOOGLE.toUpperCase())).toBe("bloqueo_seguridad");
    expect(causaDelFallo(400, REAL_GOOGLE.toLowerCase())).toBe("bloqueo_seguridad");
    expect(causaDelFallo(null, "Your prompt was FLAGGED by our Moderation system")).toBe("bloqueo_seguridad");
    expect(causaDelFallo("", "NSFW content detected")).toBe("bloqueo_seguridad");
  });

  test("las normas de contenido se distinguen del filtro de seguridad", () => {
    expect(causaDelFallo("", "The request violates our content policy")).toBe("contenido_no_permitido");
    expect(causaDelFallo("", "Prohibited content: public figure")).toBe("contenido_no_permitido");
    expect(causaDelFallo("", "Possible copyright infringement")).toBe("contenido_no_permitido");
  });

  test("una referencia que el proveedor no puede usar es una imagen rechazada", () => {
    expect(causaDelFallo("", "Failed to download the image from the provided URL")).toBe("imagen_rechazada");
    expect(causaDelFallo("", "Image url is invalid or not accessible")).toBe("imagen_rechazada");
    expect(causaDelFallo("", "Invalid image format")).toBe("imagen_rechazada");
    expect(causaDelFallo("", "Reference image too large")).toBe("imagen_rechazada");
  });

  test("una imagen bloqueada por seguridad es un bloqueo, no una imagen rechazada", () => {
    expect(causaDelFallo("", "The input image was blocked by safety review")).toBe("bloqueo_seguridad");
  });

  test("el ritmo y la saturación, por texto o por código", () => {
    expect(causaDelFallo("", "Rate limit exceeded, too many requests")).toBe("limite");
    expect(causaDelFallo("", "Request blocked: rate limit exceeded")).toBe("limite");
    expect(causaDelFallo("429", "")).toBe("limite");
    expect(causaDelFallo("", "The model is overloaded, please try again later")).toBe("saturado");
    expect(causaDelFallo("503", "")).toBe("saturado");
  });

  test("lo que no se reconoce queda como desconocida", () => {
    expect(causaDelFallo("500", "Internal error")).toBe("desconocida");
    expect(causaDelFallo("400", "")).toBe("desconocida");
    expect(causaDelFallo(undefined, undefined)).toBe("desconocida");
    expect(causaDelFallo({}, ["safety"])).toBe("desconocida");
    expect(causaDelFallo("", "generation timeout")).toBe("desconocida");
  });

  test("el texto del proveedor con una clave repetida no sale en la causa", () => {
    const clave = "sk-clave-que-el-proveedor-repite";
    for (const mensaje of [
      `generation failed for request with key ${clave}`,
      `Request blocked by safety review for key ${clave}`,
      `Failed to download image https://x.test/?key=${clave}`,
    ]) {
      const causa = causaDelFallo("500", mensaje);
      expect(CAUSAS_FALLO_PROVEEDOR).toContain(causa);
      expect(causa).not.toContain(clave);
    }
    expect(causaDelFallo("500", `generation failed for request with key ${clave}`)).toBe("desconocida");
  });
});
