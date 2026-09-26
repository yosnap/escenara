export interface ServerConfig {
  databaseUrl: string;
  storage: {
    endpoint: string;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
  };
}

const REQUIRED = [
  "DATABASE_URL",
  "S3_ENDPOINT",
  "S3_REGION",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
] as const;

type RequiredVar = (typeof REQUIRED)[number];

export class ConfigError extends Error {
  constructor(readonly missing: RequiredVar[]) {
    super(`Faltan variables de entorno: ${missing.join(", ")}. Revisa .env (plantilla en .env.example).`);
    this.name = "ConfigError";
  }
}

/** Lee y valida la configuración del servidor. Nunca incluye valores en los errores. */
export function readServerConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  const missing = REQUIRED.filter((name) => !env[name]?.trim());
  if (missing.length > 0) throw new ConfigError(missing);

  const value = (name: RequiredVar) => (env[name] as string).trim();
  return {
    databaseUrl: value("DATABASE_URL"),
    storage: {
      endpoint: value("S3_ENDPOINT"),
      region: value("S3_REGION"),
      bucket: value("S3_BUCKET"),
      accessKeyId: value("S3_ACCESS_KEY_ID"),
      secretAccessKey: value("S3_SECRET_ACCESS_KEY"),
    },
  };
}
