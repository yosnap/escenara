import { describe, expect, test } from "bun:test";
import { FORMATOS_MONTAJE } from "@/lib/formatos";
import { ESQUINAS_KIT, franjaDe } from "@/lib/marca-kit";
import { POSICIONES_ETIQUETA } from "@/lib/montaje";
import { colocacionDelLogo, franjaDeEtiqueta } from "./etiqueta";
import { resolucionDe } from "./puerta";
import { ordenDeMontar } from "./render-ffmpeg";

/**
 * El kit de marca del creador en el render: su logotipo entra como una capa más y **nunca tapa ni quita la etiqueta de
 * contenido generado con IA**. Se comprueba sin lanzar nada: con qué orden de filtros y en qué píxeles cae.
 */

const base = {
  lista: "/tmp/escenara-montaje-x/lista.txt",
  voces: [{ ruta: "/tmp/escenara-montaje-x/voz-0.m4a", volumen: 1, desdeMs: 0 }],
  musica: [{ ruta: "/tmp/escenara-montaje-x/musica-0.mp3", volumen: 0.2, desdeMs: 0 }],
  volumenClip: 1,
  subtitulos: "/tmp/escenara-montaje-x/subtitulos.srt",
  etiqueta: "abajo" as const,
  segundos: 12,
  ancho: 1080,
  alto: 1920,
  formato: "vertical_9_16" as const,
  salida: "/tmp/escenara-montaje-x/montaje.mp4",
};
const logo = { ruta: "/tmp/escenara-montaje-x/logo-kit.png", esquina: "abajo-derecha" as const };

const filtroDe = (orden: readonly string[]) => orden[orden.indexOf("-filter_complex") + 1] ?? "";

describe("logotipo del kit en la orden de montar", () => {
  test("sin kit, la orden es la de siempre: ni entrada de imagen ni overlay", () => {
    const orden = ordenDeMontar(base);
    expect(orden).not.toContain(logo.ruta);
    expect(filtroDe(orden)).not.toContain("overlay");
    expect(filtroDe(orden)).toMatch(/^\[0:v\]subtitles=/);
    expect(ordenDeMontar({ ...base, logo: null })).toEqual(orden);
  });

  test("con kit, el logotipo entra el último y la etiqueta se dibuja después de él y de los subtítulos", () => {
    const orden = ordenDeMontar({ ...base, logo });
    const entradas = orden.flatMap((a, i) => (a === "-i" ? [orden[i + 1]] : []));
    expect(entradas.at(-1)).toBe(logo.ruta);
    // Concat, voz y música ocupan 0, 1 y 2: el logotipo es la entrada 3.
    const filtro = filtroDe(orden);
    expect(filtro).toContain("[3:v]scale=w=216:h=154:force_original_aspect_ratio=decrease,format=rgba[logo]");
    expect(filtro).toContain("[0:v][logo]overlay=");
    const cadena = filtro.split(";").find((f) => f.startsWith("[vlogo]")) ?? "";
    expect(cadena.indexOf("subtitles=")).toBeGreaterThan(-1);
    expect(cadena.indexOf("drawtext=")).toBeGreaterThan(cadena.indexOf("subtitles="));
    expect(cadena.endsWith("[vout]")).toBe(true);
    // La salida de vídeo sigue siendo la que lleva la etiqueta encima de todo.
    expect(orden[orden.indexOf("-map") + 1]).toBe("[vout]");
  });

  test("la esquina elegida en la franja de la etiqueta pasa a la contraria del mismo lado", () => {
    const filtro = filtroDe(ordenDeMontar({ ...base, logo }));
    // Etiqueta abajo y esquina abajo-derecha: el logotipo va arriba a la derecha.
    expect(filtro).toMatch(/overlay=x=W-w-32:y=\d+:format=auto/);
  });

  test("en todos los formatos, esquinas y posiciones de la etiqueta, el logotipo no pisa la franja de la etiqueta", () => {
    for (const formato of FORMATOS_MONTAJE) {
      const { ancho, alto } = resolucionDe(formato);
      for (const esquina of ESQUINAS_KIT) {
        for (const etiqueta of POSICIONES_ETIQUETA) {
          const c = colocacionDelLogo(esquina, etiqueta, ancho, alto, formato);
          const franja = franjaDeEtiqueta(etiqueta, alto, formato);
          const solapa = c.y < franja.hasta && c.y + c.altoMaximo > franja.desde;
          expect({ formato, esquina, etiqueta, solapa }).toEqual({ formato, esquina, etiqueta, solapa: false });
          expect(franjaDe(c.esquina)).not.toBe(etiqueta);
          // Y dentro del cuadro.
          expect(c.x).toBeGreaterThanOrEqual(0);
          expect(c.x + c.anchoMaximo).toBeLessThanOrEqual(ancho);
          expect(c.y).toBeGreaterThanOrEqual(0);
          expect(c.y + c.altoMaximo).toBeLessThanOrEqual(alto);
        }
      }
    }
  });

  test("una ruta de logotipo rara no llega a la orden", () => {
    expect(() => ordenDeMontar({ ...base, logo: { ...logo, ruta: "/tmp/x/logo.png';drawtext=text=x" } })).toThrow();
  });
});
