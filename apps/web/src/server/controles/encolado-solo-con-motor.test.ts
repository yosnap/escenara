import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import path from "node:path";

/**
 * **Ninguna ruta encola una generación sin pasar por el motor** (criterio de aceptación de la 0.18.0).
 *
 * El test de integración lo comprueba contando: cada trabajo encolado deja exactamente una evaluación. Esto lo
 * comprueba en el código, que es lo que protege del camino nuevo que alguien escriba mañana: quien llame a
 * `encolar(` tiene que estar en un fichero que también pase por `exigirControles(`.
 *
 * Es deliberadamente tonto y de texto: un test que importara los módulos no vería el fichero que aún no
 * existe, y lo que hay que impedir es precisamente que aparezca.
 */

const RAIZ = path.resolve(import.meta.dir, "../..");

/**
 * Ficheros que **definen** el encolado y la reserva, no que los usan: son los únicos que pueden tener la llamada
 * sin la puerta, porque la llamada es su propia declaración.
 */
const DEFINICIONES = [path.join("server", "cola", "encolar.ts"), path.join("server", "presupuesto", "reserva.ts")];

/**
 * Caminos exentos, con su motivo escrito.
 *
 * `server/cola/cancelar.ts` reserva el presupuesto de un trabajo `esperando_limite` cuando el usuario le fija su
 * techo. **No encola nada y no crea ningún trabajo**: el trabajo ya existe y ya pasó por el motor al encolarse.
 * Volver a evaluarlo ahí podría rechazar algo que la instalación ya autorizó, y el techo que fija el usuario es
 * precisamente la acción del aviso `coste-no-acotable`.
 */
const EXENTOS = [path.join("server", "cola", "cancelar.ts")];

/**
 * Lo que se busca: **crear el trabajo** y **apartar su dinero**. Las dos mitades del mismo camino, porque una
 * ruta nueva podría llegar a cualquiera de ellas.
 */
const PUERTAS_DE_DINERO = [/\bencolar\(/, /\breservar\(/];

async function ficheros(dir: string): Promise<string[]> {
  const entradas = await readdir(dir, { withFileTypes: true });
  const listas = await Promise.all(
    entradas.map((e) => {
      const ruta = path.join(dir, e.name);
      if (e.isDirectory()) return ficheros(ruta);
      return /\.tsx?$/.test(e.name) && !e.name.includes(".test.") ? [ruta] : [];
    }),
  );
  return listas.flat();
}

/** Ficheros que llaman a una de las dos puertas de dinero, sin contar sus definiciones. */
async function losQueGastan(): Promise<string[]> {
  const encontrados: string[] = [];
  for (const f of await ficheros(RAIZ)) {
    const relativo = path.relative(RAIZ, f);
    if (DEFINICIONES.includes(relativo)) continue;
    const codigo = await Bun.file(f).text();
    if (PUERTAS_DE_DINERO.some((p) => p.test(codigo))) encontrados.push(relativo);
  }
  return encontrados;
}

describe("crear un trabajo o apartar su dinero solo se alcanza a través del motor de controles", () => {
  test("todo fichero que encola o reserva pasa por exigirControles", async () => {
    const infractores: string[] = [];
    for (const relativo of await losQueGastan()) {
      if (EXENTOS.includes(relativo)) continue;
      const codigo = await Bun.file(path.join(RAIZ, relativo)).text();
      if (!codigo.includes("exigirControles(")) infractores.push(relativo);
    }
    expect(infractores).toEqual([]);
  });

  test("el detector encuentra de verdad las dos puertas", async () => {
    // Si el nombre de una de las dos funciones cambiara, el test de arriba pasaría por no encontrar nada. Aquí se
    // comprueba que siguen existiendo y que los ficheros conocidos siguen apareciendo.
    // `encolar.ts` no aparece: es una de las definiciones, y es también el sitio donde la reserva va **dentro**
    // de la transacción que bloquea la fila del usuario (ADR-0016), así que su llamada a `reservar(` es suya.
    const gastan = await losQueGastan();
    expect(gastan).toContain(path.join("server", "generacion", "servicio.ts"));
    expect(gastan).toContain(path.join("server", "cola", "cancelar.ts"));
    expect(gastan).not.toContain(path.join("server", "cola", "encolar.ts"));
  });

  test("cada fichero exento sigue existiendo y sigue necesitando su exención", async () => {
    // Una exención que sobra es una exención que mañana tapa un camino nuevo: si el fichero deja de gastar, hay
    // que quitarla de la lista.
    const gastan = await losQueGastan();
    for (const exento of EXENTOS) expect(gastan).toContain(exento);
  });
});
