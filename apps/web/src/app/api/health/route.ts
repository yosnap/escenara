import { ConfigError, readServerConfig, type ServerConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

type Check = "ok" | "error";

const TIMEOUT_MS = 3000;

async function probe(task: () => Promise<unknown>): Promise<Check> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS);
  });
  try {
    await Promise.race([task(), timeout]);
    return "ok";
  } catch {
    return "error";
  } finally {
    clearTimeout(timer);
  }
}

function checkDatabase(url: string): Promise<Check> {
  return probe(async () => {
    const sql = new Bun.SQL(url, { max: 1, connectionTimeout: TIMEOUT_MS / 1000 });
    try {
      await sql`select 1`;
    } finally {
      await sql.close().catch(() => undefined);
    }
  });
}

function checkStorage(storage: ServerConfig["storage"]): Promise<Check> {
  const s3 = new Bun.S3Client({
    endpoint: storage.endpoint,
    region: storage.region,
    bucket: storage.bucket,
    accessKeyId: storage.accessKeyId,
    secretAccessKey: storage.secretAccessKey,
  });
  // Listar una clave falla si el bucket no existe o las credenciales no son válidas.
  return probe(() => s3.list({ maxKeys: 1 }));
}

/** Estado de los servicios de los que depende la aplicación. No expone configuración ni errores internos. */
export async function GET() {
  let config: ServerConfig;
  try {
    config = readServerConfig();
  } catch (error) {
    const missing = error instanceof ConfigError ? error.missing : [];
    return Response.json({ status: "error", reason: "config", missing }, { status: 503 });
  }

  const [database, storage] = await Promise.all([checkDatabase(config.databaseUrl), checkStorage(config.storage)]);
  const ok = database === "ok" && storage === "ok";
  return Response.json({ status: ok ? "ok" : "error", database, storage }, { status: ok ? 200 : 503 });
}
