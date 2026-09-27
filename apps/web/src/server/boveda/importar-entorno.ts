import { inArray } from "drizzle-orm";
import { guardarAjustes, leerAjustes } from "../ajustes";
import { db } from "../db/cliente";
import { settings } from "../db/esquema";
import { bovedaDisponible } from "./cifrado";
import { type ClaveSecreta, guardarSecreto, listarSecretos } from "./secretos";

/**
 * Traspaso **único por instalación** de las claves OAuth que aún estén en `.env` a la configuración del
 * panel (ADR-0013, decisión del propietario de la 0.9.0). En cuanto un proveedor se importa, queda
 * marcado y no se vuelve a importar nunca: si después se quita su clave en el panel, se queda quitada.
 * El panel siempre manda; el `.env` deja de usarse y nunca sirve de respaldo.
 */

const PROVEEDORES = [
  { id: "google", idAjuste: "googleClientId", claveSecreta: "googleClientSecret", prefijo: "GOOGLE", nombre: "Google" },
  { id: "github", idAjuste: "githubClientId", claveSecreta: "githubClientSecret", prefijo: "GITHUB", nombre: "GitHub" },
] as const satisfies readonly {
  id: string;
  idAjuste: "googleClientId" | "githubClientId";
  claveSecreta: ClaveSecreta;
  prefijo: string;
  nombre: string;
}[];

/** Variables de `.env` que ya no hacen nada porque su proveedor está configurado en el panel. */
export interface AvisoEntorno {
  variables: string[];
}

/**
 * Marcador de instalación: una fila en `settings` por proveedor ya importado. No son ajustes editables
 * (`leerAjustes` ignora las claves que no conoce y `guardarAjustes` no las acepta). Una fila por proveedor,
 * en lugar de una lista, permite marcarlo con un `insert … on conflict do nothing`: es atómico, así que dos
 * procesos que arranquen a la vez no se pisan el marcador del otro.
 */
export const PREFIJO_MARCADOR_IMPORTACION = "entornoImportado:";

const claveMarcador = (id: string) => `${PREFIJO_MARCADOR_IMPORTACION}${id}`;

async function proveedoresImportados(): Promise<Set<string>> {
  const filas = await db()
    .select({ key: settings.key })
    .from(settings)
    .where(
      inArray(
        settings.key,
        PROVEEDORES.map((p) => claveMarcador(p.id)),
      ),
    );
  return new Set(filas.map((f) => f.key.slice(PREFIJO_MARCADOR_IMPORTACION.length)));
}

async function marcarImportado(id: string): Promise<void> {
  await db()
    .insert(settings)
    .values({ key: claveMarcador(id), value: true, updatedAt: new Date() })
    .onConflictDoNothing();
}

// Una sola vez por proceso: la importación se intenta al primer uso de la configuración de acceso.
const global = globalThis as { __escenaraImportacionEntorno?: Promise<AvisoEntorno> };

async function importar(): Promise<AvisoEntorno> {
  const sobrantes: string[] = [];
  const sinBoveda: string[] = [];
  let ajustes = await leerAjustes();
  const guardados = new Set((await listarSecretos()).map((s) => s.clave));
  const importados = await proveedoresImportados();

  for (const p of PROVEEDORES) {
    const nombreId = `${p.prefijo}_CLIENT_ID`;
    const nombreSecreto = `${p.prefijo}_CLIENT_SECRET`;
    const variables = [nombreId, nombreSecreto];
    const idEntorno = process.env[nombreId]?.trim();
    const secretoEntorno = process.env[nombreSecreto]?.trim();
    const enEntorno = Boolean(idEntorno || secretoEntorno);
    const enPanel = ajustes[p.idAjuste].length > 0 && guardados.has(p.claveSecreta);

    // Ya importado antes, o ya configurado en el panel: no se vuelve a tocar. Si además sigue en `.env`,
    // se avisa de que esas variables ya no hacen nada.
    if (importados.has(p.id) || enPanel) {
      if (enEntorno) sobrantes.push(...variables);
      continue;
    }
    if (!enEntorno) continue;
    // Sin clave maestra no se puede cifrar el secreto de cliente, y no hay respaldo: el proveedor queda
    // desactivado hasta que se añada la clave. Se dice en claro, sin ningún valor.
    if (!bovedaDisponible()) {
      sinBoveda.push(p.nombre);
      continue;
    }
    if (!idEntorno || !secretoEntorno) {
      console.error(
        `[boveda] En .env solo está una de las dos claves de ${p.nombre} (${variables.join(" y ")}): ` +
          `el acceso con ${p.nombre} queda desactivado. Configúralo completo en Admin › Ajustes.`,
      );
      continue;
    }
    try {
      await guardarSecreto(p.claveSecreta, secretoEntorno, null);
      ajustes = await guardarAjustes({ [p.idAjuste]: idEntorno }, null);
      await marcarImportado(p.id);
      sobrantes.push(...variables);
      console.warn(
        `[boveda] Las claves de ${p.nombre} se han importado de .env a Admin › Ajustes, cifradas. ` +
          `Ya puedes borrar ${variables.join(" y ")} del archivo .env. No se volverán a importar.`,
      );
    } catch (error) {
      // Una importación fallida no debe impedir que la aplicación funcione: se avisa y se sigue. Del error
      // solo se registra el mensaje, nunca el objeto (podría arrastrar el valor en algún campo).
      console.error(
        `[boveda] no se han podido importar las claves de ${p.nombre} desde .env: ${(error as Error).message}`,
      );
    }
  }

  if (sinBoveda.length > 0) {
    console.error(
      `[boveda] Hay claves OAuth de ${sinBoveda.join(" y ")} en .env, pero falta ESCENARA_CLAVE_MAESTRA: ` +
        `no se pueden guardar cifradas y el acceso con ${sinBoveda.join(" y ")} queda desactivado. ` +
        "Genera la clave con «openssl rand -base64 32», ponla en .env y reinicia. El archivo .env no se usa " +
        "como respaldo de las claves OAuth.",
    );
  }
  return { variables: [...new Set(sobrantes)] };
}

/**
 * Ejecuta la importación una sola vez por proceso y devuelve las variables de `.env` que ya sobran (para
 * avisar en Admin › Ajustes). Si falla, no rompe nada: devuelve una lista vacía.
 */
export function importarClavesDelEntorno(): Promise<AvisoEntorno> {
  global.__escenaraImportacionEntorno ??= importar().catch((error) => {
    console.error(`[boveda] la importación de claves de .env ha fallado: ${(error as Error).message}`);
    return { variables: [] };
  });
  return global.__escenaraImportacionEntorno;
}

/** Solo para tests: permite volver a intentar la importación en el mismo proceso. */
export function olvidarImportacion(): void {
  global.__escenaraImportacionEntorno = undefined;
}
