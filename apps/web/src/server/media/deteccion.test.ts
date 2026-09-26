import { describe, expect, test } from "bun:test";
import { LIMITE_BYTES } from "@/lib/media/reglas";
import { detectarTipo, validarArchivo } from "./deteccion";

const bytes = (...partes: (number[] | string)[]) =>
  new Uint8Array(partes.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));

const ftyp = (marca: string) => bytes([0, 0, 0, 0x18], "ftyp", marca, [0, 0, 0, 0]);

describe("detectarTipo", () => {
  test.each([
    ["jpeg", bytes([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg", "imagen"],
    ["png", bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png", "imagen"],
    ["gif", bytes("GIF89a"), "image/gif", "imagen"],
    ["webp", bytes("RIFF", [0, 0, 0, 0], "WEBP"), "image/webp", "imagen"],
    ["avif", ftyp("avif"), "image/avif", "imagen"],
    ["mp4", ftyp("isom"), "video/mp4", "video"],
    ["mov", ftyp("qt  "), "video/quicktime", "video"],
    ["webm", bytes([0x1a, 0x45, 0xdf, 0xa3]), "video/webm", "video"],
    ["m4a", ftyp("M4A "), "audio/mp4", "audio"],
    ["wav", bytes("RIFF", [0, 0, 0, 0], "WAVE"), "audio/wav", "audio"],
    ["mp3 con ID3", bytes("ID3", [4, 0]), "audio/mpeg", "audio"],
    ["mp3 sin cabecera", bytes([0xff, 0xfb, 0x90]), "audio/mpeg", "audio"],
    ["aac", bytes([0xff, 0xf1, 0x50]), "audio/aac", "audio"],
    ["ogg", bytes("OggS"), "audio/ogg", "audio"],
    ["flac", bytes("fLaC"), "audio/flac", "audio"],
  ])("reconoce %s", (_, contenido, mime, tipo) => {
    expect(detectarTipo(contenido)).toMatchObject({ mime, tipo });
  });

  test("el MIME declarado solo decide entre audio y vídeo del mismo contenedor", () => {
    expect(detectarTipo(bytes([0x1a, 0x45, 0xdf, 0xa3]), "audio/webm")?.tipo).toBe("audio");
    expect(detectarTipo(ftyp("isom"), "audio/mp4")?.tipo).toBe("audio");
  });

  test("ignora el MIME declarado cuando el contenido no coincide", () => {
    expect(detectarTipo(bytes("<html>"), "image/png")).toBeNull();
    expect(detectarTipo(bytes([0x4d, 0x5a, 0x90, 0x00]), "video/mp4")).toBeNull();
  });
});

describe("validarArchivo", () => {
  test("rechaza archivos vacíos y desconocidos", () => {
    expect(validarArchivo(new Uint8Array(), "image/png")).toMatchObject({ ok: false });
    expect(validarArchivo(bytes("hola"), "text/plain")).toMatchObject({ ok: false });
  });

  test("rechaza tipos no permitidos en el contexto", () => {
    expect(validarArchivo(bytes("OggS"), "audio/ogg", ["imagen"])).toMatchObject({ ok: false });
  });

  test("rechaza archivos que superan el límite de su tipo", () => {
    const grande = new Uint8Array(LIMITE_BYTES.imagen + 1);
    grande.set([0xff, 0xd8, 0xff]);
    expect(validarArchivo(grande, "image/jpeg")).toMatchObject({ ok: false });
  });

  test("acepta un archivo válido", () => {
    expect(validarArchivo(bytes("fLaC"), "audio/flac")).toMatchObject({ ok: true, detectado: { tipo: "audio" } });
  });
});
