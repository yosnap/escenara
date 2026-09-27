/**
 * Arranque de desarrollo: la web (puerto 3021) y el worker de la cola de generación (ADR-0003), que desde
 * 0.12.0 es un proceso aparte.
 *
 * Los dos procesos van atados a este: si uno muere, se para el otro y se sale con su código. Ctrl-C los
 * para a los dos con `SIGTERM`, así que el worker se da de baja del registro de latidos y no deja trabajos
 * tomados ni procesos huérfanos.
 *
 * Los servicios de infraestructura (PostgreSQL, SeaweedFS, Mailpit) siguen viviendo en Docker Compose:
 * `bun run services:up`.
 */

interface Hijo {
  nombre: string;
  proceso: ReturnType<typeof Bun.spawn>;
}

const hijos: Hijo[] = [];
let parando = false;

function arrancar(nombre: string, argumentos: string[]): Hijo {
  const proceso = Bun.spawn(argumentos, { stdio: ["inherit", "inherit", "inherit"] });
  const hijo = { nombre, proceso };
  hijos.push(hijo);
  // Si uno termina por su cuenta (un fallo de compilación, una base de datos que no está), se paran todos:
  // dejar la web viva sin worker (o al revés) solo confunde.
  void proceso.exited.then((codigo) => {
    if (parando) return;
    console.error(`[dev] «${nombre}» ha terminado con código ${codigo}: se para todo.`);
    void parar(codigo ?? 1);
  });
  return hijo;
}

/** Plazo para que un hijo se cierre solo tras `SIGTERM`, antes de matarlo de verdad. */
const MS_PLAZO_CIERRE = 10_000;

async function parar(codigo: number): Promise<void> {
  if (parando) return;
  parando = true;
  for (const { proceso } of hijos) proceso.kill("SIGTERM");
  // Con plazo: un hijo que ignore `SIGTERM` no puede dejar esta terminal colgada para siempre. Al agotarse, se
  // mata de verdad para no dejar procesos huérfanos ocupando el puerto 3021.
  const plazo = new Promise<"plazo">((listo) => setTimeout(() => listo("plazo"), MS_PLAZO_CIERRE));
  const cerrados = Promise.all(hijos.map(({ proceso }) => proceso.exited));
  if ((await Promise.race([cerrados, plazo])) === "plazo") {
    for (const { nombre, proceso } of hijos) {
      if (proceso.exitCode === null) {
        console.warn(`[dev] «${nombre}» no se ha cerrado en ${MS_PLAZO_CIERRE / 1000} s: se fuerza.`);
        proceso.kill("SIGKILL");
      }
    }
    await cerrados;
  }
  process.exit(codigo);
}

process.on("SIGINT", () => void parar(0));
process.on("SIGTERM", () => void parar(0));

arrancar("web", ["bun", "--filter", "@escenara/web", "dev"]);
arrancar("worker", ["bun", "--filter", "@escenara/web", "worker"]);
