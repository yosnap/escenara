import { readServerConfig } from "@/lib/config";

/**
 * Filtro explícito de secretos para todo el **texto** que entra en un paquete exportado (`proyecto.json`, `LEEME.md` y
 * subtítulos). El paquete ya se construye con lista blanca, así que aquí no debería llegar ningún secreto; esto es la
 * segunda barrera, por si alguien pegó una clave en el guion o en las instrucciones de una escena.
 *
 * Retira dos cosas: los **valores exactos** de los secretos de esta instalación (almacenamiento, sesión, bóveda,
 * base de datos) y lo que **tiene forma** de credencial o de cabecera de autenticación.
 */

const RETIRADO = "[retirado]";

const PATRONES: RegExp[] = [
  // Cabeceras y esquemas de autenticación.
  /\b(?:authorization|proxy-authorization)\s*:\s*[^\n"]+/gi,
  /\b(?:bearer|basic)\s+[a-z0-9._~+/=-]{8,}/gi,
  // Parámetros de una URL firmada de S3.
  /x-amz-(?:signature|credential|security-token)=[^&\s"]+/gi,
  // Valor cifrado de la bóveda: `v1.<idClave>.<iv>.<tag>.<datos>`.
  /\bv1\.[a-z0-9_-]+\.[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}/gi,
  // Claves de API con prefijo conocido.
  /\b(?:sk|pk|rk)-[a-z0-9_-]{16,}/gi,
  /\bxox[abpr]-[a-z0-9-]{10,}/gi,
  /\bgh[pousr]_[a-z0-9]{20,}/gi,
  /\bAKIA[0-9A-Z]{16}\b/g,
  // «clave = valor» con nombre de secreto.
  /\b(?:api[_-]?key|secret|password|contrase[ñn]a|token|access[_-]?key)\s*[:=]\s*[^\s"]{6,}/gi,
];

/** Valores exactos de los secretos de la instalación que no pueden salir nunca, de más largo a más corto. */
export function secretosDeLaInstalacion(entorno: Record<string, string | undefined> = process.env): string[] {
  const valores = new Set<string>();
  try {
    const { storage, databaseUrl } = readServerConfig(entorno);
    valores.add(storage.accessKeyId);
    valores.add(storage.secretAccessKey);
    const contrasena = new URL(databaseUrl).password;
    if (contrasena) valores.add(decodeURIComponent(contrasena));
    valores.add(databaseUrl);
  } catch {
    // Sin configuración completa no hay secretos que buscar aquí; el worker no arrancaría sin ella.
  }
  for (const nombre of ["BETTER_AUTH_SECRET", "ESCENARA_CLAVE_MAESTRA", "ESCENARA_CLAVE_MAESTRA_ANTERIOR"]) {
    const valor = entorno[nombre];
    if (valor) valores.add(valor);
  }
  // Un valor muy corto retiraría palabras normales del guion: solo se buscan los que parecen un secreto.
  return [...valores].filter((v) => v.length >= 8).sort((a, b) => b.length - a.length);
}

/** Texto sin secretos. Devuelve también cuántos ha retirado, para dejarlo en el registro del worker. */
export function retirarSecretos(texto: string, secretos: string[]): { texto: string; retirados: number } {
  let retirados = 0;
  let limpio = texto;
  for (const secreto of secretos) {
    const partes = limpio.split(secreto);
    if (partes.length > 1) {
      retirados += partes.length - 1;
      limpio = partes.join(RETIRADO);
    }
  }
  for (const patron of PATRONES) {
    limpio = limpio.replace(patron, () => {
      retirados++;
      return RETIRADO;
    });
  }
  return { texto: limpio, retirados };
}
