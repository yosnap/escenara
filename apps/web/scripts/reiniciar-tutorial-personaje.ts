/**
 * Deja la cuenta de tutoriales lista para grabar «Crear un personaje»: borra los personajes inventados que creó
 * una pasada anterior del tutorial, con el mismo borrado que usa la app (cancela lo que no salió, cierra
 * reservas y borra sus retratos y vistas generados). Antes de borrar cada uno imprime el gasto de sus trabajos,
 * porque con el personaje desaparecen también sus filas de trabajo.
 *
 * Si un trabajo de la pasada anterior sigue en el proveedor, el borrado no se puede hacer todavía: se espera a que
 * termine (hasta 8 minutos) y se reintenta. Nunca imprime correos ni claves; no llama a ningún proveedor.
 *
 * Uso, desde la raíz del repositorio:
 *
 *   bun run --cwd apps/web scripts/reiniciar-tutorial-personaje.ts --cuenta CORREO --nombre NOMBRE
 */
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import {
  leerArgumentosReinicio,
  motivoParaNoReiniciar,
  personajesDelTutorial,
  resumenTrabajos,
} from "./tutorial-personaje";

const raiz = path.resolve(import.meta.dirname, "../../..");
loadEnvConfig(raiz, false, { info: () => {}, error: console.error }, true);

const ESPERA_MAXIMA_MS = 8 * 60_000;
const INTERVALO_MS = 10_000;

const { cuenta: correo, nombre } = leerArgumentosReinicio(process.argv.slice(2));

const { eq } = await import("drizzle-orm");
const { db, olvidarConexion } = await import("../src/server/db/cliente");
const { characters, generationJobs, users } = await import("../src/server/db/esquema");
const { borrarPersonaje } = await import("../src/server/personajes/borrado");
const { ErrorPersonaje } = await import("../src/server/personajes/errores");

const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));

/** Borra con el borrado de la app; si hay trabajos aún en el proveedor (409), espera y reintenta. */
async function borrarCuandoSePueda(cuentaId: string, personajeId: string): Promise<void> {
  const limite = Date.now() + ESPERA_MAXIMA_MS;
  for (;;) {
    try {
      const hecho = await borrarPersonaje({ id: cuentaId, esAdmin: false }, personajeId);
      console.log(
        `  borrado: ${hecho.trabajosBorrados} trabajos, ${hecho.trabajosCancelados} cancelados, ${hecho.clavesBorradas.length} objetos` +
          (hecho.clavesHuerfanas.length > 0 ? `, ${hecho.clavesHuerfanas.length} objetos huérfanos` : ""),
      );
      return;
    } catch (error) {
      if (!(error instanceof ErrorPersonaje) || error.estado !== 409 || Date.now() >= limite) throw error;
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

  const propios = await db()
    .select({ id: characters.id, ownerId: characters.ownerId, name: characters.name, virtual: characters.virtual })
    .from(characters)
    .where(eq(characters.ownerId, cuenta.id));
  const aBorrar = personajesDelTutorial(propios, cuenta.id, nombre);
  console.log(`Reinicio del tutorial: ${aBorrar.length} personajes «${nombre}» de pasadas anteriores.`);

  for (const personaje of aBorrar) {
    const trabajos = await db()
      .select({
        kind: generationJobs.kind,
        state: generationJobs.state,
        estimatedCredits: generationJobs.estimatedCredits,
        consumedCredits: generationJobs.consumedCredits,
      })
      .from(generationJobs)
      .where(eq(generationJobs.characterId, personaje.id));
    console.log(`- ${personaje.id}: ${resumenTrabajos(trabajos)}`);
    await borrarCuandoSePueda(cuenta.id, personaje.id);
  }
} catch (error) {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await olvidarConexion();
}
