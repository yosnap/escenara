/**
 * Lógica pura del reinicio de la cuenta de tutoriales antes de grabar «Crear un producto» o «Crear un lugar». Sin
 * base de datos: el script `reiniciar-tutorial-recurso.ts` lee las filas, esta parte decide qué se borra y el
 * script lo borra con el mismo borrado que usa la app.
 *
 * Cada tutorial crea de verdad su recurso, y repetir la grabación chocaría con el nombre que ya existe. Por eso
 * antes de cada pasada se borra **solo** el recurso de ese tutorial:
 *
 * - en una cuenta dedicada (las mismas reglas que el reinicio del tutorial de personaje);
 * - solo productos o lugares de esa cuenta con el nombre exacto que usa el tutorial. Nunca se tocan personajes:
 *   Brisa, Lupo y el resto de recursos que reutilizan otros tutoriales siguen en la cuenta.
 */
import { leerOpcionesTutorial } from "./tutorial-personaje";

export interface ArgumentosRecurso {
  cuenta: string;
  /** Nombre exacto del producto del tutorial, o `null` si esta pasada no reinicia productos. */
  producto: string | null;
  /** Nombre exacto del lugar del tutorial, o `null` si esta pasada no reinicia lugares. */
  lugar: string | null;
}

/** Un producto o un lugar tal como se lee de la base de datos para decidir si se borra. */
export interface RecursoDeCuenta {
  id: string;
  ownerId: string;
  name: string;
}

export function leerArgumentosRecurso(argv: string[]): ArgumentosRecurso {
  const { cuenta, valor } = leerOpcionesTutorial(argv, ["--producto", "--lugar"]);
  const producto = valor("--producto");
  const lugar = valor("--lugar");
  if (!producto && !lugar) {
    throw new Error("Indica con --producto o --lugar el nombre del recurso que crea el tutorial.");
  }
  return { cuenta, producto, lugar };
}

/** Recursos de la cuenta con el nombre exacto del tutorial (sin distinguir espacios de los extremos). */
export function recursosDelTutorial<T extends RecursoDeCuenta>(recursos: T[], cuentaId: string, nombre: string): T[] {
  const buscado = nombre.trim();
  return recursos.filter((r) => r.ownerId === cuentaId && r.name.trim() === buscado);
}
