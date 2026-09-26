/** Cliente mínimo de la API de Gemini para el prototipo: imagen con referencias y vídeo Veo. */
const API = "https://generativelanguage.googleapis.com/v1beta";

function headers(): Record<string, string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Falta GEMINI_API_KEY en .env");
  return { "x-goog-api-key": key, "Content-Type": "application/json" };
}

async function inline(ruta: string) {
  const f = Bun.file(ruta);
  return {
    inlineData: { mimeType: f.type || "image/jpeg", data: Buffer.from(await f.arrayBuffer()).toString("base64") },
  };
}

async function check<T>(res: Response): Promise<T> {
  const body = (await res.json()) as T & { error?: { code: number; message: string } };
  if (body.error) throw new Error(`Google ${body.error.code}: ${body.error.message}`);
  return body;
}

/** Genera una imagen a partir de fotos de referencia. Devuelve los bytes PNG/JPEG. */
export async function imagen(modelo: string, prompt: string, referencias: string[]): Promise<Uint8Array> {
  const parts = [...(await Promise.all(referencias.map(inline))), { text: prompt }];
  const body = await check<{
    candidates?: { content?: { parts?: { inlineData?: { data: string } }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  }>(
    await fetch(`${API}/models/${modelo}:generateContent`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "9:16" } },
      }),
    }),
  );
  const data = body.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData?.data;
  if (!data) {
    const motivo = body.promptFeedback?.blockReason ?? body.candidates?.[0]?.finishReason ?? "sin imagen";
    throw new Error(`Google no devolvió imagen (${motivo})`);
  }
  return Buffer.from(data, "base64");
}

/** Anima una imagen con Veo. Devuelve los bytes MP4. No reintenta: un fallo se informa tal cual. */
export async function video(modelo: string, prompt: string, fotograma: string, segundos: number): Promise<Uint8Array> {
  const img = (await inline(fotograma)).inlineData;
  const op = await check<{ name: string }>(
    await fetch(`${API}/models/${modelo}:predictLongRunning`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        instances: [{ prompt, image: { bytesBase64Encoded: img.data, mimeType: img.mimeType } }],
        parameters: {
          aspectRatio: "9:16",
          durationSeconds: segundos,
          resolution: "720p",
          personGeneration: "allow_adult",
        },
      }),
    }),
  );
  const inicio = Date.now();
  while (Date.now() - inicio < 15 * 60_000) {
    await Bun.sleep(10_000);
    const estado = await check<{
      done?: boolean;
      response?: {
        generateVideoResponse?: {
          generatedSamples?: { video?: { uri?: string } }[];
          raiMediaFilteredReasons?: string[];
        };
      };
    }>(await fetch(`${API}/${op.name}`, { headers: headers() }));
    if (!estado.done) continue;
    const r = estado.response?.generateVideoResponse;
    const uri = r?.generatedSamples?.[0]?.video?.uri;
    if (!uri) throw new Error(`Veo terminó sin vídeo: ${r?.raiMediaFilteredReasons?.join("; ") ?? "sin motivo"}`);
    const res = await fetch(uri, { headers: { "x-goog-api-key": headers()["x-goog-api-key"] as string } });
    return new Uint8Array(await res.arrayBuffer());
  }
  throw new Error(`Tiempo agotado; operación ${op.name}: consulta su estado antes de relanzar nada`);
}
