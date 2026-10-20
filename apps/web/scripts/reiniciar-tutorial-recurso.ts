/**
 * Deja la cuenta de tutoriales lista para grabar «Crear un producto» o «Crear un lugar»: borra el producto o el
 * lugar con el nombre exacto del tutorial que dejó una pasada anterior, con el mismo borrado que usa la app. No toca
 * personajes ni ningún otro producto o lugar: lo que reutilizan otros tutoriales sigue en la cuenta.
 *
 * Las fotos del recurso se quedan en la biblioteca (el borrado de la app solo suelta la relación). Si un lugar tiene
 * un trabajo en marcha, el borrado no se puede hacer todavía: se espera a que termine (hasta 8 minutos) y se
 * reintenta. Nunca imprime correos ni claves; no llama a ningún proveedor.
 *
 * Uso, desde la raíz del repositorio:
 *
 *   bun run --cwd apps/web scripts/reiniciar-tutorial-recurso.ts --cuenta CORREO [--producto NOMBRE] [--lugar NOMBRE]
 */
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { motivoParaNoReiniciar } from "./tutorial-personaje";
import { leerArgumentosRecurso, recursosDelTutorial } from "./tutorial-recurso";

const raiz = path.resolve(import.meta.dirname, "../../..");
loadEnvConfig(raiz, false, { info: () => {}, error: console.error }, true);

const ESPERA_MAXIMA_MS = 8 * 60_000;
const INTERVALO_MS = 10_000;

const { cuenta: correo, producto, lugar } = leerArgumentosRecurso(process.argv.slice(2));

const { eq } = await import("drizzle-orm");
const { db, olvidarConexion } = await import("../src/server/db/cliente");
const { places, products, users } = await import("../src/server/db/esquema");
const { borrarProducto } = await import("../src/server/productos/borrado");
const { borrarLugar } = await import("../src/server/lugares/borrado");
const { ErrorLugar } = await import("../src/server/lugares/errores");

const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));

/** Borra el lugar con el borrado de la app; si hay trabajos en marcha que lo usan (409), espera y reintenta. */
async function borrarLugarCuandoSePueda(cuentaId: string, lugarId: string): Promise<void> {
  const limite = Date.now() + ESPERA_MAXIMA_MS;
  for (;;) {
    try {
      const hecho = await borrarLugar({ id: cuentaId, esAdmin: false }, lugarId);
      console.log(
        `  borrado: ${hecho.referenciasBorradas} fotos sueltas, ${hecho.escenasLiberadas} escenas y ${hecho.proyectosLiberados} proyectos sin lugar`,
      );
      return;
    } catch (error) {
      if (!(error instanceof ErrorLugar) || error.estado !== 409 || Date.now() >= limite) throw error;
      console.log(`  espera: ${error.message}`);
      await esperar(INTERVALO_MS);
    }
  }
}

try {
  const [cuenta] = await db()
    .select({ id: users.id, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.email, correo))
    .limit(1);
  const motivo = motivoParaNoReiniciar(cuenta ?? null);
  if (motivo || !cuenta) throw new Error(motivo ?? "Cuenta no encontrada.");

  if (producto) {
    const propios = await db()
      .select({ id: products.id, ownerId: products.ownerId, name: products.name })
      .from(products)
      .where(eq(products.ownerId, cuenta.id));
    const aBorrar = recursosDelTutorial(propios, cuenta.id, producto);
    console.log(`Reinicio del tutorial: ${aBorrar.length} productos «${producto}» de pasadas anteriores.`);
    for (const fila of aBorrar) {
      const hecho = await borrarProducto({ id: cuenta.id, esAdmin: false }, fila.id);
      console.log(
        `- ${fila.id}: ${hecho.referenciasBorradas} fotos sueltas, ${hecho.escenasLiberadas} escenas y ${hecho.trabajosLiberados} trabajos sin producto`,
      );
    }
  }

  if (lugar) {
    const propios = await db()
      .select({ id: places.id, ownerId: places.ownerId, name: places.name })
      .from(places)
      .where(eq(places.ownerId, cuenta.id));
    const aBorrar = recursosDelTutorial(propios, cuenta.id, lugar);
    console.log(`Reinicio del tutorial: ${aBorrar.length} lugares «${lugar}» de pasadas anteriores.`);
    for (const fila of aBorrar) {
      console.log(`- ${fila.id}`);
      await borrarLugarCuandoSePueda(cuenta.id, fila.id);
    }
  }
} catch (error) {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await olvidarConexion();
}
