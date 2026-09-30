import { describe, expect, test } from "bun:test";
import { demoVisibleParaUsuarios, leerTramo, rutaDeDemo, textoAlternativoDeDemo, tipoDeDemo } from "./demo-plantilla";

describe("tipo de un ejemplo", () => {
  test("acepta imágenes y vídeos de los formatos de la biblioteca", () => {
    expect(tipoDeDemo("imagen", "image/png")).toBe("imagen");
    expect(tipoDeDemo("imagen", "image/webp")).toBe("imagen");
    expect(tipoDeDemo("video", "video/mp4")).toBe("video");
    expect(tipoDeDemo("video", "video/mp4; codecs=avc1")).toBe("video");
  });

  test("rechaza audio, SVG y un tipo que no cuadra con el medio", () => {
    expect(tipoDeDemo("audio", "audio/mpeg")).toBeNull();
    expect(tipoDeDemo("imagen", "image/svg+xml")).toBeNull();
    expect(tipoDeDemo("imagen", "video/mp4")).toBeNull();
    expect(tipoDeDemo("video", "text/html")).toBeNull();
    expect(tipoDeDemo("documento", "image/png")).toBeNull();
  });
});

describe("ruta del ejemplo", () => {
  test("no lleva el identificador del medio y cambia al cambiar de medio", () => {
    const medio = "0b7e2f9a-1111-4222-8333-444455556666";
    const ruta = rutaDeDemo("p1", medio);
    expect(ruta).toMatch(/^\/api\/prompts\/plantillas\/p1\/demo\?v=[0-9a-f]{8}$/);
    expect(ruta).not.toContain(medio);
    expect(rutaDeDemo("p1", "otro-medio")).not.toBe(ruta);
    expect(rutaDeDemo("p1", medio)).toBe(ruta);
  });
});

describe("texto alternativo", () => {
  test("usa el del medio, luego su título y por último uno que nombra la plantilla", () => {
    expect(textoAlternativoDeDemo({ altEs: " Una mano abre la caja ", title: "t" }, "Unboxing", "video")).toBe(
      "Una mano abre la caja",
    );
    expect(textoAlternativoDeDemo({ altEs: "", title: "Caja abierta" }, "Unboxing", "imagen")).toBe("Caja abierta");
    expect(textoAlternativoDeDemo({ altEs: "", title: "" }, "Unboxing", "video")).toBe("Clip de ejemplo de «Unboxing»");
    expect(textoAlternativoDeDemo({ altEs: "", title: "" }, "Fotograma", "imagen")).toBe(
      "Imagen de ejemplo de «Fotograma»",
    );
  });
});

describe("quién ve el ejemplo", () => {
  const base = { deLaInstalacion: true, activa: true, kind: "base" as const, trendStatus: null };
  const trend = { ...base, kind: "trend" as const, trendStatus: "vigente" as const };

  test("una plantilla normal activa, sí; desactivada o de un usuario, no", () => {
    expect(demoVisibleParaUsuarios(base, true)).toBe(true);
    expect(demoVisibleParaUsuarios({ ...base, activa: false }, true)).toBe(false);
    expect(demoVisibleParaUsuarios({ ...base, deLaInstalacion: false }, true)).toBe(false);
  });

  test("un trend, solo vigente, activo y con los trends visibles", () => {
    expect(demoVisibleParaUsuarios(trend, true)).toBe(true);
    expect(demoVisibleParaUsuarios(trend, false)).toBe(false);
    expect(demoVisibleParaUsuarios({ ...trend, trendStatus: "caducada" }, true)).toBe(false);
    expect(demoVisibleParaUsuarios({ ...trend, trendStatus: "revision" }, true)).toBe(false);
    expect(demoVisibleParaUsuarios({ ...trend, activa: false }, true)).toBe(false);
  });
});

describe("tramo de bytes", () => {
  test("sin cabecera o ilegible se sirve entero", () => {
    expect(leerTramo(null, 100)).toBeNull();
    expect(leerTramo("items=0-1", 100)).toBeNull();
    expect(leerTramo("bytes=0-1,5-9", 100)).toBeNull();
    expect(leerTramo("bytes=-", 100)).toBeNull();
    // Final antes del principio: no es válido, se ignora (no es un 416).
    expect(leerTramo("bytes=20-10", 100)).toBeNull();
    expect(leerTramo("bytes=5-3", 100)).toBeNull();
  });

  test("lee tramos cerrados, abiertos y de cola, acotados al tamaño", () => {
    expect(leerTramo("bytes=0-9", 100)).toEqual({ inicio: 0, fin: 9 });
    expect(leerTramo("bytes=90-", 100)).toEqual({ inicio: 90, fin: 99 });
    expect(leerTramo("bytes=50-500", 100)).toEqual({ inicio: 50, fin: 99 });
    expect(leerTramo("bytes=-10", 100)).toEqual({ inicio: 90, fin: 99 });
    expect(leerTramo("bytes=-500", 100)).toEqual({ inicio: 0, fin: 99 });
  });

  test("lo que pide algo que no existe es un rango fuera", () => {
    expect(leerTramo("bytes=100-", 100)).toBe("fuera");
    expect(leerTramo("bytes=-0", 100)).toBe("fuera");
    expect(leerTramo("bytes=0-", 0)).toBe("fuera");
  });
});
