import { describe, expect, test } from "bun:test";
import { categoriaDeModelo } from "./compatible";

describe("clase de un modelo de un servicio compatible", () => {
  test("reconoce transcripción, voz, texto y lo que Escenara no usa, por el nombre", () => {
    expect(categoriaDeModelo("whisper")).toBe("transcripcion");
    expect(categoriaDeModelo("whisper-large-v3")).toBe("transcripcion");
    expect(categoriaDeModelo("kokoro")).toBe("voz");
    expect(categoriaDeModelo("gemma4")).toBe("texto");
    expect(categoriaDeModelo("glm5.3-flash")).toBe("texto");
    expect(categoriaDeModelo("minimax-h3")).toBe("texto");
    for (const otro of ["qwen3-embedding", "rerank", "flux-2-klein", "qwen-image-2.1"]) {
      expect(categoriaDeModelo(otro)).toBe("otro");
    }
  });
});
