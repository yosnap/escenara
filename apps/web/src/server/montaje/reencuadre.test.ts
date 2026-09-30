import { describe, expect, test } from "bun:test";
import { ErrorMontaje } from "./errores";
import { filtroDeEtiqueta, filtroDeSubtitulos, margenDeSubtitulos } from "./etiqueta";
import { filtroDeEncuadre, ordenDeIgualar } from "./render-ffmpeg";

/**
 * El reencuadre y las zonas seguras por formato (0.41.0), comprobados **sin lanzar nada**: qué filtro sale para
 * cada encuadre y en qué margen caen los subtítulos y la etiqueta. La prueba de integración mide los píxeles; aquí
 * se vigila que el vertical siga saliendo con los argumentos de siempre.
 */

const filtroDe = (orden: readonly string[]): string => orden[orden.indexOf("-filter_complex") + 1] ?? "";

const fragmento = {
  ruta: "/tmp/escenara-montaje-x/clip-0.mp4",
  entrada: 0,
  duracion: 2,
  tieneAudio: true,
  salida: "/tmp/escenara-montaje-x/parte-0.mp4",
  ancho: 1080,
  alto: 1920,
};

describe("el encuadre en el filtro de igualar", () => {
  test("sin encuadre y con bandas, el filtro es exactamente el de siempre", () => {
    const deSiempre =
      "[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30[v]";
    expect(filtroDe(ordenDeIgualar(fragmento))).toBe(deSiempre);
    expect(filtroDe(ordenDeIgualar({ ...fragmento, encuadre: { modo: "bandas" } }))).toBe(deSiempre);
  });

  test("el recorte llena el formato y se queda con la parte elegida del sobrante", () => {
    const filtro = filtroDe(
      ordenDeIgualar({ ...fragmento, ancho: 1920, alto: 1080, encuadre: { modo: "recorte", x: 50, y: 0 } }),
    );
    expect(filtro).toContain("scale=1920:1080:force_original_aspect_ratio=increase");
    expect(filtro).toContain("crop=1920:1080:(iw-1920)*0.500:(ih-1080)*0.000");
    expect(filtro).not.toContain("pad=");
  });

  test("las posiciones van de 0 a 1 en el filtro, y una fuera de rango no llega a FFmpeg", () => {
    expect(filtroDeEncuadre("1080", "1080", { modo: "recorte", x: 100, y: 25 }).join(",")).toContain(
      "(iw-1080)*1.000:(ih-1080)*0.250",
    );
    expect(() => filtroDeEncuadre("1080", "1080", { modo: "recorte", x: -5, y: 0 })).toThrow(ErrorMontaje);
  });
});

describe("la zona segura de cada formato", () => {
  test("los subtítulos del vertical conservan su margen de siempre (63), y cada formato el suyo", () => {
    expect(margenDeSubtitulos("vertical_9_16")).toBe(63);
    expect(margenDeSubtitulos("horizontal_16_9")).toBe(40);
    expect(margenDeSubtitulos("cuadrado_1_1")).toBe(35);
    expect(margenDeSubtitulos("vertical_4_5")).toBe(35);
    expect(filtroDeSubtitulos("/tmp/x/s.srt")).toContain("MarginV=63");
    expect(filtroDeSubtitulos("/tmp/x/s.srt", "horizontal_16_9")).toContain("MarginV=40");
  });

  test("la etiqueta se coloca bajo la franja de arriba o sobre la de abajo del formato", () => {
    // Vertical: 12 % de 1920 son 230, más el margen de 16.
    expect(filtroDeEtiqueta("arriba", 1920)).toContain("y=246");
    expect(filtroDeEtiqueta("arriba", 1920, "vertical_9_16")).toBe(filtroDeEtiqueta("arriba", 1920));
    // Horizontal: 8 % de 1080 son 86 arriba; 14 % son 151 abajo.
    expect(filtroDeEtiqueta("arriba", 1080, "horizontal_16_9")).toContain("y=102");
    expect(filtroDeEtiqueta("abajo", 1080, "horizontal_16_9")).toContain("y=h-167-text_h");
  });
});
