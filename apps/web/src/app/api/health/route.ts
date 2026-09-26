import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { Client } from "pg";
import { ConfigError, readServerConfig, type ServerConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

type Check = "ok" | "error";

async function checkDatabase(url: string): Promise<Check> {
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 3000 });
  try {
    await client.connect();
    await client.query("select 1");
    return "ok";
  } catch {
    return "error";
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function checkStorage(storage: ServerConfig["storage"]): Promise<Check> {
  const s3 = new S3Client({
    endpoint: storage.endpoint,
    region: storage.region,
    forcePathStyle: true,
    credentials: { accessKeyId: storage.accessKeyId, secretAccessKey: storage.secretAccessKey },
  });
  try {
    await s3.send(new HeadBucketCommand({ Bucket: storage.bucket }), { abortSignal: AbortSignal.timeout(3000) });
    return "ok";
  } catch {
    return "error";
  } finally {
    s3.destroy();
  }
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
