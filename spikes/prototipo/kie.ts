/** Cliente mínimo de KIE.ai para el prototipo: subida temporal, tareas, estado y saldo. */
const API = "https://api.kie.ai";
const UPLOAD = "https://kieai.redpandaai.co/api/file-stream-upload";

function auth(): Record<string, string> {
  const key = process.env.KIE_API_KEY;
  if (!key) throw new Error("Falta KIE_API_KEY en .env");
  return { Authorization: `Bearer ${key}` };
}

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json()) as { code: number; msg: string; data: T };
  if (body.code !== 200) throw new Error(`KIE ${body.code}: ${body.msg}`);
  return body.data;
}

export async function saldoCreditos(): Promise<number> {
  return json<number>(await fetch(`${API}/api/v1/chat/credit`, { headers: auth() }));
}

/** Sube una foto local; KIE la borra automáticamente pasadas unas horas. */
export async function subir(ruta: string): Promise<string> {
  const form = new FormData();
  form.append("file", Bun.file(ruta));
  form.append("uploadPath", "escenara/prototipo");
  const data = await json<{ downloadUrl: string }>(
    await fetch(UPLOAD, { method: "POST", headers: auth(), body: form }),
  );
  return data.downloadUrl;
}

export async function crearTarea(model: string, input: Record<string, unknown>): Promise<string> {
  const data = await json<{ taskId: string }>(
    await fetch(`${API}/api/v1/jobs/createTask`, {
      method: "POST",
      headers: { ...auth(), "Content-Type": "application/json" },
      body: JSON.stringify({ model, input }),
    }),
  );
  return data.taskId;
}

export interface ResultadoTarea {
  urls: string[];
  creditos: number | null;
  segundos: number;
}

/** Espera a que termine la tarea. Si se agota el tiempo NO se reenvía: se informa del taskId. */
export async function esperar(taskId: string, maxMinutos = 15): Promise<ResultadoTarea> {
  const inicio = Date.now();
  while (Date.now() - inicio < maxMinutos * 60_000) {
    const d = await json<{ state: string; resultJson?: string; failMsg?: string; creditsConsumed?: number }>(
      await fetch(`${API}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, { headers: auth() }),
    );
    if (d.state === "success") {
      const r = JSON.parse(d.resultJson ?? "{}") as { resultUrls?: string[] };
      return { urls: r.resultUrls ?? [], creditos: d.creditsConsumed ?? null, segundos: (Date.now() - inicio) / 1000 };
    }
    if (d.state === "fail") throw new Error(`Tarea ${taskId} fallida: ${d.failMsg ?? "sin detalle"}`);
    await Bun.sleep(8000);
  }
  throw new Error(`Tiempo agotado esperando ${taskId}; consulta su estado antes de relanzar nada`);
}
