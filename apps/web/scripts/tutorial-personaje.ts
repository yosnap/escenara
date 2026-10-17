/**
 * Lógica pura del reinicio de la cuenta de tutoriales antes de grabar el tutorial «Crear un personaje». Sin
 * base de datos: el script `reiniciar-tutorial-personaje.ts` lee las filas, esta parte decide qué se borra, y el
 * script lo borra con el mismo borrado que usa la app.
 *
 * El tutorial crea de verdad un personaje inventado y le genera retratos y vistas. Repetir la grabación crearía
 * otro igual, así que antes de cada pasada se borran los que dejó la anterior. Las reglas que lo hacen seguro:
 *
 * - solo en una cuenta dedicada: correo de un dominio reservado para pruebas (`.test`, `.example`, `example.com`…)
 *   y sin administración. Nunca la cuenta de una persona;
 * - solo personajes **inventados** de esa cuenta con el nombre exacto que usa el tutorial y, si se pide con
 *   `--mascota`, el **animal** de esa cuenta con el nombre exacto de la mascota del tutorial. Una persona real, o
 *   cualquier otro personaje con otro nombre o de otro tipo, no se toca.
 */

/** Lo que se lee de la cuenta: nunca se imprime el correo. */
export interface CuentaTutorial {
  id: string;
  email: string;
  role: string;
}

export interface PersonajeDeCuenta {
  id: string;
  ownerId: string;
  name: string;
  virtual: boolean;
  /** `persona` o `animal` (en un inventado, el tipo con el que se guarda). */
  kind: string;
}

export interface TrabajoDePersonaje {
  kind: string;
  state: string;
  estimatedCredits: number;
  consumedCredits: number | null;
}

/** Dominios reservados para pruebas y ejemplos (RFC 2606 y RFC 6761). */
const DOMINIO_RESERVADO = /@(?:[a-z0-9-]+\.)*(?:test|example|invalid|localhost|example\.(?:com|net|org))$/i;

/**
 * Lee las opciones `--clave valor` de la línea de órdenes, rechaza las desconocidas y valida `--cuenta` (obligatoria
 * y de un dominio reservado). Devuelve un lector del resto de opciones y la cuenta en minúsculas.
 */
export function leerOpcionesTutorial(
  argv: string[],
  conocidas: readonly string[],
): { cuenta: string; valor: (nombre: string) => string | null } {
  const valor = (nombre: string): string | null => {
    const i = argv.indexOf(nombre);
    if (i < 0) return null;
    const siguiente = argv[i + 1]?.trim();
    if (!siguiente || siguiente.startsWith("--")) throw new Error(`${nombre} necesita un valor.`);
    return siguiente;
  };
  const desconocida = argv.find((a) => a.startsWith("--") && a !== "--cuenta" && !conocidas.includes(a));
  if (desconocida) throw new Error(`Opción desconocida: ${desconocida}.`);
  const cuenta = valor("--cuenta");
  if (!cuenta) throw new Error("Indica la cuenta de tutoriales con --cuenta (correo).");
  if (!DOMINIO_RESERVADO.test(cuenta)) {
    throw new Error("--cuenta tiene que ser un correo de un dominio reservado para pruebas (p. ej. «.test»).");
  }
  return { cuenta: cuenta.toLowerCase(), valor };
}

export function leerArgumentosReinicio(argv: string[]): { cuenta: string; nombre: string; mascota: string | null } {
  const { cuenta, valor } = leerOpcionesTutorial(argv, ["--nombre", "--mascota"]);
  const nombre = valor("--nombre");
  if (!nombre) throw new Error("Indica con --nombre el nombre del personaje que crea el tutorial.");
  return { cuenta, nombre, mascota: valor("--mascota") };
}

/** Motivo para no tocar la cuenta, o `null` si es una cuenta dedicada de tutoriales. */
export function motivoParaNoReiniciar(cuenta: CuentaTutorial | null): string | null {
  if (!cuenta) return "No existe ninguna cuenta con ese correo.";
  if (!DOMINIO_RESERVADO.test(cuenta.email)) return "La cuenta no es de un dominio reservado para pruebas.";
  if (cuenta.role !== "user") return "La cuenta tiene administración: el reinicio solo se hace en cuentas normales.";
  return null;
}

/**
 * Personajes que dejó una pasada anterior del tutorial, siempre de la cuenta y con el nombre exacto: los inventados
 * llamados `nombre` y, si se indica `mascota`, los animales (no inventados) con ese nombre.
 */
export function personajesDelTutorial(
  personajes: PersonajeDeCuenta[],
  cuentaId: string,
  nombre: string,
  mascota: string | null = null,
): PersonajeDeCuenta[] {
  const llamado = (p: PersonajeDeCuenta, n: string) => p.name.trim() === n.trim();
  return personajes.filter(
    (p) =>
      p.ownerId === cuentaId &&
      ((p.virtual && llamado(p, nombre)) ||
        (mascota !== null && !p.virtual && p.kind === "animal" && llamado(p, mascota))),
  );
}

/** Resumen del gasto de un personaje antes de borrarlo: al borrarlo desaparecen sus trabajos. */
export function resumenTrabajos(trabajos: TrabajoDePersonaje[]): string {
  if (trabajos.length === 0) return "sin trabajos";
  const estimados = trabajos.reduce((s, t) => s + t.estimatedCredits, 0);
  const consumidos = trabajos.reduce((s, t) => s + (t.consumedCredits ?? 0), 0);
  const porEstado = new Map<string, number>();
  for (const t of trabajos) porEstado.set(`${t.kind}/${t.state}`, (porEstado.get(`${t.kind}/${t.state}`) ?? 0) + 1);
  const estados = [...porEstado].map(([clave, n]) => `${n} ${clave}`).join(", ");
  return `${trabajos.length} trabajos (${estados}); créditos estimados ${estimados}, consumidos ${consumidos}`;
}
