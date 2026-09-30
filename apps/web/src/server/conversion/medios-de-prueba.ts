import sharp from "sharp";

/**
 * Material de las pruebas de la conversión: FFmpeg y fotos fabricadas en la propia máquina. Nada de esto llama a
 * ningún proveedor ni sale de la máquina.
 */

/** Lanza un FFmpeg de la prueba y devuelve su salida de error, que es donde escribe `volumedetect`. */
export async function ffmpeg(argumentos: readonly string[]): Promise<{ ok: boolean; error: string }> {
  const proceso = Bun.spawn(["ffmpeg", "-nostdin", "-hide_banner", ...argumentos], { stdout: "pipe", stderr: "pipe" });
  const [error, codigo] = await Promise.all([new Response(proceso.stderr).text(), proceso.exited]);
  return { ok: codigo === 0, error };
}

export const copia = (datos: Uint8Array): Uint8Array<ArrayBuffer> => {
  const nueva = new Uint8Array(new ArrayBuffer(datos.byteLength));
  nueva.set(datos);
  return nueva;
};

export const fotoDeReferencia = async (): Promise<Uint8Array<ArrayBuffer>> =>
  copia(
    await sharp({
      create: {
        width: 640,
        height: 640,
        channels: 3,
        background: "#808080",
        noise: { type: "gaussian", mean: 128, sigma: 40 },
      },
    })
      .png()
      .toBuffer(),
  );
