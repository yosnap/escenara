import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  type ComprobacionRevision,
  esComprobacionCritica,
  mantieneCritico,
  peorSeveridad,
  severidadDeComprobacion,
} from "@/lib/revision";
import { evaluar, frenosQueGatean } from "../controles/motor";
import { volcarAcotado } from "./archivo";
import { comprobacionesDeArchivo, ladoMenorDeResolucion, pedidoDeEscena, proporcionPedida } from "./automatica";
import { notasAutomaticas, resultadoAutomatico } from "./ejecutar";
import { exigirMotivo } from "./humana";
import { herramientasDeMedida, medirClip, olvidarHerramientasDeMedida } from "./medicion";

/**
 * Revisión de continuidad (RF07, 0.20.0): las partes que se pueden probar **sin base de datos**.
 *
 * Las comprobaciones técnicas se prueban con clips de verdad hechos con `ffmpeg` en un directorio temporal: medir un
 * MP4 inventado a mano no probaría nada de lo que hace ffprobe. Si FFmpeg no está instalado, esos tests se saltan y
 * se dice por qué, en lugar de pasar en verde sin haber medido nada.
 *
 * **Ningún test llama a ningún proveedor**: aquí no hay ni una petición de red.
 */

const PARAMETROS = { exigirCoberturaVistas: false, exigirPrecioFresco: false, maximoAvisos: 3 };
const UMBRALES = { toleranciaDuracion: 0.5, segundosPlanosMaximos: 0.5, exigirAudio: false };

describe("qué bloquea la exportación", () => {
  test("un crítico abierto la bloquea, y el motor lo dice con su motivo y su acción", () => {
    const evaluacion = evaluar({
      tipo: "animacion",
      parametros: PARAMETROS,
      exportacion: { criticos: [{ orden: 2, motivo: "El clip dura 1,2 s y la escena pedía 4 s." }] },
    });
    expect(evaluacion.estado).toBe("bloqueado");
    const freno = frenosQueGatean(evaluacion).find((f) => f.regla === "revision-critica-abierta");
    expect(freno).toBeDefined();
    expect(freno?.estado).toBe("bloqueado");
    // No es salvable con una casilla: un `bloqueado` nunca lo es.
    expect(freno?.confirmable).toBe(false);
    expect(freno?.motivo).toContain("escena 2");
    expect(freno?.motivo).toContain("1,2 s");
    expect(freno?.accion).not.toBe("");
  });

  test("varios críticos se enumeran y siguen bloqueando", () => {
    const evaluacion = evaluar({
      tipo: "animacion",
      parametros: PARAMETROS,
      exportacion: {
        criticos: [
          { orden: 1, motivo: "No se lee." },
          { orden: 3, motivo: "Otra proporción." },
        ],
      },
    });
    expect(evaluacion.estado).toBe("bloqueado");
    expect(frenosQueGatean(evaluacion)[0]?.motivo).toContain("(1, 3)");
  });

  test("sin críticos abiertos no bloquea nada, y sin el grupo de hechos la regla ni se evalúa", () => {
    expect(evaluar({ tipo: "animacion", parametros: PARAMETROS, exportacion: { criticos: [] } }).estado).toBe("listo");
    // Producir una escena no aporta este grupo: un crítico de otra escena no puede impedir seguir trabajando.
    expect(evaluar({ tipo: "fotograma", parametros: PARAMETROS }).estado).toBe("listo");
  });

  test("una revisión crítica que alguien aceptó, o que se invalidó, deja de mantener el crítico", () => {
    const base = {
      id: "r1",
      tipo: "humana" as const,
      severidad: "critica" as const,
      veredicto: "rechaza" as const,
      comprobaciones: [],
      notas: "El pelo no coincide con la hoja.",
      creditos: null,
      reglasVersion: "x",
      motivoInvalidacion: "",
      invalidada: false,
      creadoEn: "2026-09-27T10:00:00.000Z",
    };
    expect(mantieneCritico(base)).toBe(true);
    expect(mantieneCritico({ ...base, veredicto: "acepta" })).toBe(false);
    expect(mantieneCritico({ ...base, invalidada: true })).toBe(false);
    expect(mantieneCritico({ ...base, severidad: "aviso" })).toBe(false);
  });
});

describe("severidad de las comprobaciones", () => {
  test("el formato y la duración son críticos; el audio y los tramos planos solo avisan", () => {
    expect(esComprobacionCritica("duracion")).toBe(true);
    expect(esComprobacionCritica("proporcion")).toBe(true);
    expect(esComprobacionCritica("archivo")).toBe(true);
    expect(esComprobacionCritica("audio")).toBe(false);
    expect(esComprobacionCritica("planos")).toBe(false);
    expect(severidadDeComprobacion("duracion", "falla")).toBe("critica");
    expect(severidadDeComprobacion("audio", "falla")).toBe("aviso");
  });

  test("no poder medir no es aprobar: avisa", () => {
    expect(severidadDeComprobacion("duracion", "no_medible")).toBe("aviso");
    expect(severidadDeComprobacion("duracion", "pasa")).toBe("informativa");
    expect(peorSeveridad(["informativa", "aviso", "critica"])).toBe("critica");
    expect(peorSeveridad([])).toBe("informativa");
  });

  test("la comprobación automática nunca acepta: cuando todo pasa, la escena queda sin decidir", () => {
    const duracion: ComprobacionRevision = {
      clave: "duracion",
      resultado: "pasa",
      severidad: "informativa",
      medido: "4 s",
      esperado: "4 s",
      motivo: ".",
    };
    const pasan = [duracion];
    expect(resultadoAutomatico(pasan)).toEqual({ severidad: "informativa", veredicto: "pendiente" });
    expect(notasAutomaticas(pasan)).toContain("lo decides tú");
    const fallan = [{ ...duracion, resultado: "falla" as const, severidad: "critica" as const }];
    expect(resultadoAutomatico(fallan)).toEqual({ severidad: "critica", veredicto: "rechaza" });
  });
});

describe("volcado acotado del clip", () => {
  /** Flujo de `trozos` bloques de 1 MiB. Sirve para montar un archivo grande sin escribirlo antes en ningún sitio. */
  const flujoDe = (trozos: number): ReadableStream<Uint8Array> => {
    let enviados = 0;
    return new ReadableStream<Uint8Array>({
      pull(controlador) {
        if (enviados >= trozos) return controlador.close();
        enviados++;
        controlador.enqueue(new Uint8Array(1024 * 1024));
      },
    });
  };

  test("un flujo que pasa de 64 MiB se corta al contar los bytes, aunque nadie lo hubiera declarado", async () => {
    const carpetaVolcado = await mkdtemp(path.join(tmpdir(), "escenara-volcado-"));
    try {
      const ruta = path.join(carpetaVolcado, "clip.mp4");
      // 65 MiB: el tope está en 64, así que el volcado tiene que pararse él solo.
      await expect(volcarAcotado(flujoDe(65), ruta)).rejects.toThrow(/64 MB/);
      // Y lo escrito antes de cortar no pasa del tope: no se llena el disco «casi entero».
      const escrito = (await Bun.file(ruta).exists()) ? Bun.file(ruta).size : 0;
      expect(escrito).toBeLessThanOrEqual(64 * 1024 * 1024);
    } finally {
      await rm(carpetaVolcado, { recursive: true, force: true });
    }
  });

  test("un flujo que cabe se vuelca entero", async () => {
    const carpetaVolcado = await mkdtemp(path.join(tmpdir(), "escenara-volcado-"));
    try {
      const ruta = path.join(carpetaVolcado, "clip.mp4");
      await volcarAcotado(flujoDe(2), ruta);
      expect(Bun.file(ruta).size).toBe(2 * 1024 * 1024);
    } finally {
      await rm(carpetaVolcado, { recursive: true, force: true });
    }
  });
});

describe("comprobación de FFmpeg", () => {
  test("el resultado favorable se cachea en el proceso y se puede olvidar", async () => {
    const primera = await herramientasDeMedida();
    const segunda = await herramientasDeMedida();
    if (primera.disponibles) {
      // Misma referencia: la segunda llamada no ha vuelto a lanzar dos procesos para preguntar lo mismo.
      expect(segunda).toBe(primera);
      olvidarHerramientasDeMedida();
      const tercera = await herramientasDeMedida();
      expect(tercera).not.toBe(primera);
      expect(tercera.disponibles).toBe(true);
    } else {
      // Lo desfavorable **no** se cachea: instalar FFmpeg sin reiniciar tiene que poder verse.
      expect(segunda).not.toBe(primera);
      expect(segunda.motivo).not.toBe("");
    }
  });
});

describe("motivo de la revisión humana", () => {
  test("rechazar y marcar como crítico exigen motivo; aceptar no", () => {
    expect(exigirMotivo("aceptar", "")).toBe("");
    expect(() => exigirMotivo("rechazar", "corto")).toThrow();
    expect(() => exigirMotivo("marcar-critico", "  ")).toThrow();
    expect(exigirMotivo("rechazar", "  el pelo cambia de color  ")).toBe("el pelo cambia de color");
  });
});

describe("lectura de lo pedido", () => {
  test("resoluciones y proporciones que se entienden, y las que no", () => {
    expect(ladoMenorDeResolucion("720p")).toBe(720);
    expect(ladoMenorDeResolucion("1080p")).toBe(1080);
    expect(ladoMenorDeResolucion("cuadrada")).toBeNull();
    expect(proporcionPedida("9:16")).toBeCloseTo(0.5625, 4);
    expect(proporcionPedida("raro")).toBeNull();
  });
});

// ── Comprobaciones sobre clips de verdad ──────────────────────────────────────────────────────────────────

/**
 * La detección de FFmpeg y el directorio temporal van **arriba y con `await`**, no en un `beforeAll`: `skipIf` se
 * evalúa al recoger los tests, así que un valor que se calcule después no saltaría nada y los tests fallarían en
 * lugar de saltarse.
 */
const { disponibles: hayFfmpeg, motivo: sinFfmpeg } = await herramientasDeMedida();
const carpeta = hayFfmpeg ? await mkdtemp(path.join(tmpdir(), "escenara-revision-test-")) : "";
if (!hayFfmpeg) console.warn(`[revisión] las comprobaciones sobre clips reales se saltan: ${sinFfmpeg}`);

async function generar(nombre: string, ...argumentos: string[]): Promise<string> {
  const ruta = path.join(carpeta, nombre);
  const proceso = Bun.spawn(["ffmpeg", "-y", "-nostdin", "-hide_banner", "-loglevel", "error", ...argumentos, ruta], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [codigo, error] = await Promise.all([proceso.exited, new Response(proceso.stderr).text()]);
  if (codigo !== 0) throw new Error(`ffmpeg no ha podido crear ${nombre}: ${error}`);
  return ruta;
}

/** Clip vertical 720 × 1280 de los segundos que se pidan, con audio o sin él. */
const clipVertical = (nombre: string, segundos: number, conAudio: boolean) =>
  generar(
    nombre,
    "-f",
    "lavfi",
    "-i",
    `color=c=#3d6bff:s=720x1280:d=${segundos}:r=24`,
    ...(conAudio ? ["-f", "lavfi", "-i", `sine=frequency=440:duration=${segundos}`, "-shortest"] : []),
    "-pix_fmt",
    "yuv420p",
  );

afterAll(async () => {
  if (carpeta !== "") await rm(carpeta, { recursive: true, force: true });
});

describe.skipIf(!hayFfmpeg)("comprobaciones automáticas sobre clips reales", () => {
  test("un clip correcto pasa todas las comprobaciones que se pueden medir", async () => {
    const ruta = await clipVertical("bueno.mp4", 4, true);
    const comprobaciones = await comprobacionesDeArchivo(ruta, pedidoDeEscena(4), UMBRALES);
    const porClave = new Map(comprobaciones.map((c) => [c.clave, c]));
    expect(porClave.get("archivo")?.resultado).toBe("pasa");
    expect(porClave.get("duracion")?.resultado).toBe("pasa");
    expect(porClave.get("resolucion")?.resultado).toBe("pasa");
    expect(porClave.get("proporcion")?.resultado).toBe("pasa");
    expect(porClave.get("audio")?.resultado).toBe("pasa");
    // Y el valor medido está ahí: «falla la duración» sin decir cuánto dura no permite decidir nada.
    expect(porClave.get("duracion")?.medido).toMatch(/s$/);
    expect(peorSeveridad(comprobaciones.map((c) => c.severidad))).not.toBe("critica");
  });

  test("un clip con otra duración falla, y falla como crítico", async () => {
    const ruta = await clipVertical("corto.mp4", 1, false);
    const comprobaciones = await comprobacionesDeArchivo(ruta, pedidoDeEscena(4), UMBRALES);
    const duracion = comprobaciones.find((c) => c.clave === "duracion");
    expect(duracion?.resultado).toBe("falla");
    expect(duracion?.severidad).toBe("critica");
    expect(duracion?.medido).toContain("1");
    expect(duracion?.esperado).toContain("4");
    expect(duracion?.motivo).toContain("regenera");
  });

  test("un clip con otra proporción falla la proporción y la resolución", async () => {
    const ruta = await generar(
      "cuadrado.mp4",
      "-f",
      "lavfi",
      "-i",
      "color=c=#ff5c8a:s=480x480:d=4:r=24",
      "-pix_fmt",
      "yuv420p",
    );
    const comprobaciones = await comprobacionesDeArchivo(ruta, pedidoDeEscena(4), UMBRALES);
    const proporcion = comprobaciones.find((c) => c.clave === "proporcion");
    expect(proporcion?.resultado).toBe("falla");
    expect(proporcion?.severidad).toBe("critica");
    expect(proporcion?.medido).toContain("480");
    const resolucion = comprobaciones.find((c) => c.clave === "resolucion");
    expect(resolucion?.resultado).toBe("falla");
  });

  test("un clip sin audio se detecta: avisa si se exige y no si no", async () => {
    const ruta = await clipVertical("mudo.mp4", 4, false);
    const medidas = await medirClip(ruta);
    expect(medidas.tieneAudio).toBe(false);
    expect(medidas.tieneVideo).toBe(true);

    const sinExigir = await comprobacionesDeArchivo(ruta, pedidoDeEscena(4), UMBRALES);
    const suave = sinExigir.find((c) => c.clave === "audio");
    expect(suave?.resultado).toBe("pasa");
    expect(suave?.medido).toBe("sin pista de audio");

    const exigiendo = await comprobacionesDeArchivo(ruta, pedidoDeEscena(4), { ...UMBRALES, exigirAudio: true });
    const duro = exigiendo.find((c) => c.clave === "audio");
    expect(duro?.resultado).toBe("falla");
    // Falta el audio, pero eso no es un formato incorrecto: avisa, no bloquea la exportación.
    expect(duro?.severidad).toBe("aviso");
  });

  test("un archivo que no es un vídeo devuelve solo la comprobación del archivo", async () => {
    const ruta = path.join(carpeta, "roto.mp4");
    await Bun.write(ruta, "esto no es un vídeo");
    const comprobaciones = await comprobacionesDeArchivo(ruta, pedidoDeEscena(4), UMBRALES);
    expect(comprobaciones).toHaveLength(1);
    expect(comprobaciones[0]?.clave).toBe("archivo");
    expect(comprobaciones[0]?.severidad).toBe("critica");
  });

  test("un clip entero en negro se mide como tramo plano y avisa", async () => {
    const ruta = await generar(
      "negro.mp4",
      "-f",
      "lavfi",
      "-i",
      "color=c=black:s=720x1280:d=4:r=24",
      "-pix_fmt",
      "yuv420p",
    );
    const comprobaciones = await comprobacionesDeArchivo(ruta, pedidoDeEscena(4), UMBRALES);
    const planos = comprobaciones.find((c) => c.clave === "planos");
    expect(planos?.resultado).toBe("falla");
    expect(planos?.severidad).toBe("aviso");
    expect(planos?.medido).toContain("en negro");
  });
});
