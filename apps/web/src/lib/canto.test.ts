import { describe, expect, it } from "bun:test";
import { FORMATOS_AUDIO_DE_CANTO, MIME_AUDIO_DE_CANTO, textoDeFormatosDeCanto } from "./canto";

describe("formatos de audio de canto", () => {
  it("el texto lista todos los formatos de la constante, en su orden y con «o» al final", () => {
    const texto = textoDeFormatosDeCanto();
    for (const { nombre } of FORMATOS_AUDIO_DE_CANTO) expect(texto).toContain(nombre);
    expect(texto).toBe("MP3, WAV, OGG, M4A o AAC");
    expect(texto.split(/,| o /).length).toBe(FORMATOS_AUDIO_DE_CANTO.length);
  });

  it("los tipos MIME admitidos salen de la misma lista", () => {
    expect(MIME_AUDIO_DE_CANTO).toEqual(FORMATOS_AUDIO_DE_CANTO.map((f) => f.mime));
    expect(MIME_AUDIO_DE_CANTO).toContain("audio/mpeg");
  });
});
