import { readServerConfig } from "@/lib/config";

/** Vigencia de las URL temporales de lectura: los medios pueden contener datos personales. */
export const VIGENCIA_URL_SEGUNDOS = 60 * 60;

const global = globalThis as { __escenaraS3?: Bun.S3Client };

function s3(): Bun.S3Client {
  if (!global.__escenaraS3) {
    const { storage } = readServerConfig();
    global.__escenaraS3 = new Bun.S3Client({
      endpoint: storage.endpoint,
      region: storage.region,
      bucket: storage.bucket,
      accessKeyId: storage.accessKeyId,
      secretAccessKey: storage.secretAccessKey,
    });
  }
  return global.__escenaraS3;
}

export async function guardarObjeto(clave: string, datos: Uint8Array, tipo: string) {
  await s3().write(clave, datos, { type: tipo });
}

export async function borrarObjeto(clave: string) {
  await s3().delete(clave);
}

export function leerObjeto(clave: string) {
  return s3().file(clave);
}

export function urlTemporal(clave: string): string {
  return s3().presign(clave, { expiresIn: VIGENCIA_URL_SEGUNDOS, method: "GET" });
}

/** El navegador ignora `download` en enlaces a otro origen: S3 debe responder como adjunto. */
export function urlTemporalDescargaMontaje(clave: string): string {
  return s3().presign(clave, {
    expiresIn: VIGENCIA_URL_SEGUNDOS,
    method: "GET",
    contentDisposition: 'attachment; filename="escenara-montaje.mp4"',
  });
}
