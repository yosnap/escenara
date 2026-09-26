import { describe, expect, it } from "vitest";
import { ConfigError, readServerConfig } from "./config";

const complete = {
  DATABASE_URL: "postgresql://usuario:clave@localhost:5421/escenara",
  S3_ENDPOINT: "http://localhost:8321",
  S3_REGION: "us-east-1",
  S3_BUCKET: "escenara",
  S3_ACCESS_KEY_ID: "id-de-prueba",
  S3_SECRET_ACCESS_KEY: "secreto-de-prueba",
};

function captureError(env: Record<string, string | undefined>): ConfigError {
  try {
    readServerConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) return error;
  }
  throw new Error("Se esperaba un ConfigError");
}

describe("readServerConfig", () => {
  it("devuelve la configuración cuando están todas las variables", () => {
    const config = readServerConfig(complete);
    expect(config.databaseUrl).toBe(complete.DATABASE_URL);
    expect(config.storage).toEqual({
      endpoint: "http://localhost:8321",
      region: "us-east-1",
      bucket: "escenara",
      accessKeyId: "id-de-prueba",
      secretAccessKey: "secreto-de-prueba",
    });
  });

  it("lista todas las variables que faltan o están vacías", () => {
    const error = captureError({ ...complete, S3_BUCKET: "  ", DATABASE_URL: undefined });
    expect(error.missing).toEqual(["DATABASE_URL", "S3_BUCKET"]);
  });

  it("no filtra valores secretos en el mensaje de error", () => {
    const error = captureError({ ...complete, S3_ENDPOINT: undefined });
    expect(error.message).toContain("S3_ENDPOINT");
    expect(error.message).not.toContain("secreto-de-prueba");
    expect(error.message).not.toContain("clave");
  });
});
