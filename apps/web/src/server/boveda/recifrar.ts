import { and, eq } from "drizzle-orm";
import { db } from "../db/cliente";
import { installationSecrets, providerCredentials } from "../db/esquema";
import { cifrar, descifrar, idClaveActual, idClaveDe } from "./cifrado";
import { type ClaveSecreta, esClaveSecreta } from "./secretos";

/**
 * Recifrado de la bóveda tras cambiar la clave maestra (ADR-0005). Con la nueva en
 * `ESCENARA_CLAVE_MAESTRA` y la vieja en `ESCENARA_CLAVE_MAESTRA_ANTERIOR`, vuelve a cifrar con la nueva
 * todo lo que aún use otra. Es idempotente: lo que ya está al día no se toca.
 *
 * El contexto (AAD) se recalcula igual que al guardar, así que un valor no puede cambiar de fila.
 *
 * **Conviene hacerlo con el servidor parado.** Cada fila se reescribe solo si su valor sigue siendo el que
 * se leyó, así que nada se pierde si alguien guarda a la vez; pero esas filas se quedan sin recifrar y hay
 * que volver a pasar el recifrado.
 */

export interface ResumenRecifrado {
  credenciales: Contador;
  secretos: Contador;
}

export interface Contador {
  recifradas: number;
  alDia: number;
  ilegibles: number;
  /** Filas que alguien cambió mientras se recifraban: se dejaron intactas y hay que repetir el proceso. */
  cambiadas: number;
}

const contador = (): Contador => ({ recifradas: 0, alDia: 0, ilegibles: 0, cambiadas: 0 });

/** Aviso de una fila que no se ha recifrado. Se espera, para que se pueda registrar en algún sitio lento. */
export type Avisar = (mensaje: string) => void | Promise<void>;

/** Recifra un valor si usa otra clave; devuelve `null` si ya está al día. */
function recifrarValor(valor: string, contexto: string, idActual: string): string | null {
  if (idClaveDe(valor) === idActual) return null;
  return cifrar(descifrar(valor, contexto), contexto);
}

async function recifrarCredenciales(idActual: string, avisar: Avisar): Promise<Contador> {
  const cuenta = contador();
  const filas = await db()
    .select({
      id: providerCredentials.id,
      userId: providerCredentials.userId,
      provider: providerCredentials.provider,
      secret: providerCredentials.secret,
    })
    .from(providerCredentials)
    // Orden estable: el informe de una pasada se puede comparar con el de la siguiente.
    .orderBy(providerCredentials.createdAt, providerCredentials.id);
  for (const fila of filas) {
    try {
      const nuevo = recifrarValor(fila.secret, `credencial:${fila.userId}:${fila.provider}`, idActual);
      if (!nuevo) {
        cuenta.alDia++;
        continue;
      }
      // Solo se reescribe si el valor sigue siendo el leído: si se sustituyó entre medias, se respeta.
      const cambiadas = await db()
        .update(providerCredentials)
        .set({ secret: nuevo })
        .where(and(eq(providerCredentials.id, fila.id), eq(providerCredentials.secret, fila.secret)))
        .returning({ id: providerCredentials.id });
      if (cambiadas.length === 0) {
        cuenta.cambiadas++;
        await avisar(`credencial ${fila.provider} del usuario ${fila.userId}: cambió mientras se recifraba.`);
      } else cuenta.recifradas++;
    } catch (error) {
      cuenta.ilegibles++;
      // Sin el valor ni la clave: solo qué fila hay que volver a guardar a mano.
      await avisar(`credencial ${fila.provider} del usuario ${fila.userId}: ${(error as Error).message}`);
    }
  }
  return cuenta;
}

async function recifrarSecretos(idActual: string, avisar: Avisar): Promise<Contador> {
  const cuenta = contador();
  const filas = await db().select().from(installationSecrets).orderBy(installationSecrets.key);
  for (const fila of filas) {
    if (!esClaveSecreta(fila.key)) continue;
    const clave: ClaveSecreta = fila.key;
    try {
      const nuevo = recifrarValor(fila.value, `ajuste:${clave}`, idActual);
      if (!nuevo) {
        cuenta.alDia++;
        continue;
      }
      const cambiadas = await db()
        .update(installationSecrets)
        .set({ value: nuevo })
        .where(and(eq(installationSecrets.key, clave), eq(installationSecrets.value, fila.value)))
        .returning({ key: installationSecrets.key });
      if (cambiadas.length === 0) {
        cuenta.cambiadas++;
        await avisar(`secreto ${clave}: cambió mientras se recifraba.`);
      } else cuenta.recifradas++;
    } catch (error) {
      cuenta.ilegibles++;
      await avisar(`secreto ${clave}: ${(error as Error).message}`);
    }
  }
  return cuenta;
}

/** Recifra toda la bóveda con la clave maestra actual. `avisar` recibe las filas que no se han recifrado. */
export async function recifrarBoveda(avisar: Avisar = console.error): Promise<ResumenRecifrado> {
  const idActual = idClaveActual();
  return {
    credenciales: await recifrarCredenciales(idActual, avisar),
    secretos: await recifrarSecretos(idActual, avisar),
  };
}
