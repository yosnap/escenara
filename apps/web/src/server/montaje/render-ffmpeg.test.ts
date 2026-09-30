import { describe, expect, test } from "bun:test";
import { FPS_MONTAJE } from "@/lib/montaje";
import { ErrorMontaje } from "./errores";
import { segundosDeLinea } from "./ffmpeg";
import { listaDeConcatenacion, ordenDeIgualar, ordenDeMontar, rutaSegura } from "./render-ffmpeg";

/**
 * Las órdenes de FFmpeg del render (RF08, 0.32.0), comprobadas **sin lanzar nada**.
 *
 * Lo que se vigila aquí es lo que no se ve en una prueba de integración: que los parámetros de salida sean los
 * mismos para todos los fragmentos (concatenar cadencias distintas desincroniza el audio), que una ruta rara se
 * rechace en lugar de colarse en un filtro, y que en la orden no haya texto de nadie.
 */

const base = {
  lista: "/tmp/escenara-montaje-x/lista.txt",
  voces: [],
  musica: [],
  volumenClip: 1,
  subtitulos: null,
  etiqueta: null,
  segundos: 12,
  ancho: 1080,
  alto: 1920,
  formato: "vertical_9_16" as const,
  salida: "/tmp/escenara-montaje-x/montaje.mp4",
};

const filtroDe = (orden: readonly string[]): string => {
  const indice = orden.indexOf("-filter_complex");
  return orden[indice + 1] ?? "";
};

describe("igualar un fragmento", () => {
  const fragmento = {
    ruta: "/tmp/escenara-montaje-x/clip-0.mp4",
    entrada: 1.25,
    duracion: 3.5,
    tieneAudio: true,
    salida: "/tmp/escenara-montaje-x/parte-0.mp4",
    ancho: 1080,
    alto: 1920,
  };

  test("recorta con -ss y -t antes de la entrada, y escala sin deformar", () => {
    const orden = ordenDeIgualar(fragmento);
    expect(orden.slice(0, 1)).toEqual(["ffmpeg"]);
    const ss = orden.indexOf("-ss");
    expect(orden[ss + 1]).toBe("1.250");
    expect(ss).toBeLessThan(orden.indexOf("-i"));
    expect(filtroDe(orden)).toContain("scale=1080:1920:force_original_aspect_ratio=decrease");
    expect(filtroDe(orden)).toContain("pad=1080:1920");
    expect(filtroDe(orden)).toContain(`fps=${FPS_MONTAJE}`);
  });

  test("todos los fragmentos salen con los mismos códecs y la misma cadencia", () => {
    const a = ordenDeIgualar(fragmento);
    const b = ordenDeIgualar({ ...fragmento, duracion: 2, entrada: 0, tieneAudio: false });
    /** Valor de cada parámetro de salida, para comparar dos órdenes por lo que de verdad decide el formato. */
    const formatoDe = (orden: readonly string[]) =>
      ["-c:v", "-c:a", "-r", "-ar", "-ac", "-pix_fmt"].map((clave) => orden[orden.indexOf(clave) + 1]);
    expect(formatoDe(a)).toEqual(formatoDe(b));
    expect(formatoDe(a)).toEqual(["libx264", "aac", String(FPS_MONTAJE), "48000", "2", "yuv420p"]);
  });

  test("un clip sin audio recibe silencio para que la concatenación no pierda la pista", () => {
    const orden = ordenDeIgualar({ ...fragmento, tieneAudio: false });
    expect(orden).toContain("anullsrc=channel_layout=stereo:sample_rate=48000");
    expect(orden[orden.indexOf("-map", orden.indexOf("[v]")) + 1]).toBe("1:a:0");
  });

  test("una duración imposible no compone ninguna orden", () => {
    expect(() => ordenDeIgualar({ ...fragmento, duracion: Number.NaN })).toThrow(ErrorMontaje);
    expect(() => ordenDeIgualar({ ...fragmento, entrada: -1 })).toThrow(ErrorMontaje);
  });
});

describe("rutas", () => {
  test("una ruta con comillas, comas o punto y coma se rechaza en lugar de escaparse", () => {
    for (const ruta of ["/tmp/x'y.mp4", "/tmp/a,b.mp4", "/tmp/a;rm -rf /.mp4", "/tmp/a b.mp4", "/tmp/$(id).mp4"]) {
      expect(() => rutaSegura(ruta)).toThrow(ErrorMontaje);
    }
  });

  test("la lista del concat cita cada ruta en su línea", () => {
    expect(listaDeConcatenacion(["/tmp/a.mp4", "/tmp/b.mp4"])).toBe("file '/tmp/a.mp4'\nfile '/tmp/b.mp4'\n");
  });
});

describe("montar el vídeo final", () => {
  test("sin voz, sin música y sin etiqueta, el vídeo pasa tal cual y el audio no se mezcla", () => {
    const orden = ordenDeMontar(base);
    const filtro = filtroDe(orden);
    expect(filtro).toContain("[0:v]null[vout]");
    expect(filtro).toContain("[aclips]anull[aout]");
    expect(filtro).not.toContain("amix");
    expect(orden).toContain("-t");
    expect(orden[orden.indexOf("-t") + 1]).toBe("12.000");
  });

  test("la voz entra en el segundo de su fragmento y la música desde el principio", () => {
    const filtro = filtroDe(
      ordenDeMontar({
        ...base,
        voces: [{ ruta: "/tmp/escenara-montaje-x/voz-1.mp3", volumen: 1.2, desdeMs: 4000 }],
        musica: [{ ruta: "/tmp/escenara-montaje-x/musica-0.mp3", volumen: 0.2, desdeMs: 0 }],
      }),
    );
    expect(filtro).toContain("[1:a]volume=1.200,adelay=4000:all=1[a1]");
    expect(filtro).toContain("[2:a]volume=0.200[a2]");
    // `normalize=0`: mezclar tres pistas no puede bajar el volumen de la voz sin que nadie lo haya pedido.
    expect(filtro).toContain("amix=inputs=3:duration=longest:normalize=0[aout]");
  });

  test("los subtítulos quemados van antes de la etiqueta, que queda siempre encima", () => {
    const filtro = filtroDe(
      ordenDeMontar({ ...base, subtitulos: "/tmp/escenara-montaje-x/subtitulos.srt", etiqueta: "abajo" }),
    );
    expect(filtro.indexOf("subtitles=filename=")).toBeLessThan(filtro.indexOf("drawtext="));
    expect(filtro).toContain("Contenido generado con IA");
  });

  test("la etiqueta arriba y abajo respeta la zona segura de cada lado", () => {
    const arriba = filtroDe(ordenDeMontar({ ...base, etiqueta: "arriba" }));
    const abajo = filtroDe(ordenDeMontar({ ...base, etiqueta: "abajo" }));
    // 12 % de 1920 = 230, más el margen de 16.
    expect(arriba).toContain("y=246");
    // 22 % de 1920 = 422, más el margen.
    expect(abajo).toContain("y=h-438-text_h");
  });

  test("en la orden no hay ni una sola comilla de texto de nadie", () => {
    const orden = ordenDeMontar({ ...base, subtitulos: "/tmp/escenara-montaje-x/subtitulos.srt", etiqueta: "abajo" });
    // El único texto entre comillas es la etiqueta, que es una constante nuestra, y el estilo de los subtítulos.
    const conComillas = orden.filter((a) => a.includes("'"));
    expect(conComillas).toHaveLength(1);
    expect(conComillas[0]).toContain("Contenido generado con IA");
  });
});

describe("progreso real de FFmpeg", () => {
  test("se leen los segundos ya escritos y nada más", () => {
    expect(segundosDeLinea("out_time_us=1500000")).toBe(1.5);
    expect(segundosDeLinea("out_time_ms=2500")).toBe(2.5);
    expect(segundosDeLinea("frame=42")).toBeNull();
    expect(segundosDeLinea("progress=continue")).toBeNull();
    expect(segundosDeLinea("out_time_us=N/A")).toBeNull();
  });
});
