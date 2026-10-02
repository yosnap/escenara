import path from "node:path";
import { loadEnvConfig } from "@next/env";

/** Ensayo breve: BD sintética de QA y toda salida HTTP a proveedores bloqueada. */
loadEnvConfig(path.resolve(import.meta.dirname, "../../.."), true, { info() {}, error() {} }, true);
const qa = await Bun.file("/tmp/escenara-admin-qa.json").json();
const url = new URL(qa.databaseUrl);
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.pathname !== "/escenara_pruebas_admin_qa")
  throw new Error("Worker QA solo en su BD local aislada.");
process.env.DATABASE_URL = url.toString();
globalThis.fetch = (async () => {
  throw new Error("Red de proveedores bloqueada durante QA.");
}) as typeof fetch;
const { arrancarWorker } = await import("../src/server/cola/worker");
const { db, olvidarConexion } = await import("../src/server/db/cliente");
const { sql } = await import("drizzle-orm");
const worker = arrancarWorker();
try {
  await Bun.sleep(7000);
  const [latido] = await db().execute(
    sql`select count(*)::int n from queue_workers where seen_at > now() - interval '10 seconds'`,
  );
  if (!latido || latido.n < 1) throw new Error("No se registró el latido del worker.");
  console.log("Worker compatible: latido local registrado, proveedores inaccesibles.");
} finally {
  await worker.parar();
  await olvidarConexion();
}
