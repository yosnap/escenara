import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { peorSeveridad } from "@/lib/revision";
import { comprobacionesDeArchivo, pedidoDeEscena } from "./automatica";
import { herramientasDeMedida } from "./medicion";

/**
 * La revisión de continuidad compara el clip con **la proporción de su formato** (0.41.0), no con 9:16 fijo: en un
 * proyecto horizontal o cuadrado, un clip bien generado no puede salir como fallo crítico, que bloquearía exportar.
 */
const UMBRALES = { toleranciaDuracion: 0.5, segundosPlanosMaximos: 0.5, exigirAudio: false };

const { disponibles: hayFfmpeg } = await herramientasDeMedida();
const carpeta = hayFfmpeg ? await mkdtemp(path.join(tmpdir(), "escenara-revision-formato-")) : "";

async function clip(nombre: string, medidas: string): Promise<string> {
  const ruta = path.join(carpeta, nombre);
  const proceso = Bun.spawn(
    [
      "ffmpeg",
      "-y",
      "-nostdin",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      `color=c=#3d6bff:s=${medidas}:d=4:r=24`,
      "-pix_fmt",
      "yuv420p",
      ruta,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  if ((await proceso.exited) !== 0) throw new Error(`ffmpeg no ha podido crear ${nombre}.`);
  return ruta;
}

afterAll(async () => {
  if (carpeta !== "") await rm(carpeta, { recursive: true, force: true });
});

describe.skipIf(!hayFfmpeg)("la proporción que espera la revisión", () => {
  test("un clip 16:9 de un proyecto horizontal pasa la proporción y no es crítico", async () => {
    const comprobaciones = await comprobacionesDeArchivo(
      await clip("h.mp4", "1280x720"),
      pedidoDeEscena(4, "16:9"),
      UMBRALES,
    );
    expect(comprobaciones.find((c) => c.clave === "proporcion")?.resultado).toBe("pasa");
    expect(comprobaciones.find((c) => c.clave === "resolucion")?.resultado).toBe("pasa");
    expect(peorSeveridad(comprobaciones.map((c) => c.severidad))).not.toBe("critica");
  });

  test("un clip 1:1 de un proyecto cuadrado pasa la proporción", async () => {
    const comprobaciones = await comprobacionesDeArchivo(
      await clip("c.mp4", "720x720"),
      pedidoDeEscena(4, "1:1"),
      UMBRALES,
    );
    expect(comprobaciones.find((c) => c.clave === "proporcion")?.resultado).toBe("pasa");
  });

  test("el mismo clip 16:9 comparado con el vertical sí falla: por eso importa pasar el formato", async () => {
    const comprobaciones = await comprobacionesDeArchivo(await clip("h2.mp4", "1280x720"), pedidoDeEscena(4), UMBRALES);
    expect(comprobaciones.find((c) => c.clave === "proporcion")?.resultado).toBe("falla");
  });
});
