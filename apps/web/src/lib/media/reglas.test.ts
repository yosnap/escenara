import { describe, expect, test } from "bun:test";
import {
  aceptarArchivos,
  formatearDuracion,
  formatearSegundos,
  formatearTamano,
  LIMITE_BYTES,
  motivoRechazo,
  tipoDeMime,
} from "./reglas";

describe("reglas de medios", () => {
  test("clasifica los MIME admitidos e ignora los parámetros", () => {
    expect(tipoDeMime("image/webp")).toBe("imagen");
    expect(tipoDeMime("video/webm; codecs=vp9")).toBe("video");
    expect(tipoDeMime("audio/mpeg")).toBe("audio");
    expect(tipoDeMime("application/pdf")).toBeNull();
  });

  test("el atributo accept se limita a los tipos pedidos", () => {
    expect(aceptarArchivos(["audio"])).not.toContain("image/");
    expect(aceptarArchivos()).toContain("video/mp4");
  });

  test("motivoRechazo comprueba formato, tipos permitidos, vacío y tamaño", () => {
    expect(motivoRechazo({ type: "text/plain", size: 10 })).toBe("Formato no admitido.");
    expect(motivoRechazo({ type: "image/png", size: 10 }, ["video"])).toBe("Formato no admitido.");
    expect(motivoRechazo({ type: "image/png", size: 0 })).toBe("El archivo está vacío.");
    expect(motivoRechazo({ type: "image/png", size: LIMITE_BYTES.imagen + 1 })).toContain("10 MB");
    expect(motivoRechazo({ type: "audio/wav", size: 1000 })).toBeNull();
  });

  test("formatea tamaños y duraciones", () => {
    expect(formatearTamano(512)).toBe("512 B");
    expect(formatearTamano(1536)).toBe("1,5 KB");
    expect(formatearTamano(200 * 1024 * 1024)).toBe("200 MB");
    expect(formatearDuracion(65.4)).toBe("1:05");
    expect(formatearDuracion(3725)).toBe("1:02:05");
  });
});

describe("formatearSegundos", () => {
  test("usa la coma decimal de es-ES y la unidad", () => {
    expect(formatearSegundos(0.2)).toBe("0,2 s");
    expect(formatearSegundos(8.1)).toBe("8,1 s");
    expect(formatearSegundos(15)).toBe("15 s");
  });

  test("recorta a los decimales pedidos", () => {
    expect(formatearSegundos(3.456)).toBe("3,46 s");
    expect(formatearSegundos(3.456, 1)).toBe("3,5 s");
  });
});
