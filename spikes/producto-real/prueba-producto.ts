/**
 * **Prueba real del producto** (0.26.0). Gasta créditos de verdad: no se ejecuta sin autorización expresa del
 * propietario, y por eso el modo de fábrica es el ensayo.
 *
 * Qué mide, que es lo que la versión necesita saber y no se puede saber sin pagar:
 *
 * 1. **persona + producto en un fotograma**: si el modelo pone el bote en la mano de la persona sin cambiarle
 *    la cara cuando recibe las dos referencias;
 * 2. **conservación de la etiqueta**: si el texto impreso sale igual que en la foto de referencia;
 * 3. **logo real**: qué hace el filtro del proveedor ante una marca de verdad, y si cobra cuando la rechaza;
 * 4. **`character_ids` + `image_urls` en Omni**: si el proveedor acepta las dos cosas a la vez o rechaza la
 *    petición. Es la pregunta abierta 2 de la fase, y de su respuesta depende si una escena con producto
 *    pierde o no la identidad registrada.
 *
 * Uso (desde `apps/web`, para que funcionen los alias `@/`):
 *
 *   bun --env-file=../../.env ../../spikes/producto-real/prueba-producto.ts              # ensayo, no gasta
 *   bun --env-file=../../.env ../../spikes/producto-real/prueba-producto.ts --real       # envía de verdad
 *   bun --env-file=../../.env ../../spikes/producto-real/prueba-producto.ts --recoger    # solo sondea y guarda
 *
 * Garantías, todas comprobadas **antes** de cada llamada:
 *
 * - **tope duro de 300 créditos**: se suma lo ya consumido (lo que informa cada tarea y, por si acaso, la
 *   caída real del saldo, lo que sea mayor) más la estimación de la siguiente. Si se pasa, no se envía;
 * - **nunca se reenvía nada**: el identificador de tarea se escribe en `estado.json` en cuanto existe, y una
 *   tarea que ya lo tiene solo se vuelve a consultar. `--recoger` es justo eso y nada más, para poder cerrar
 *   la prueba en otra sesión sin riesgo de duplicar un envío;
 * - **la clave nunca se imprime ni se escribe**: se lee del documento privado del propietario y solo viaja
 *   dentro del cliente de KIE;
 * - al terminar, los resultados se **importan a la biblioteca del propietario** con `crearMedio`, con un
 *   nombre que dice qué prueba cada uno.
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { crearMedio } from "../../apps/web/src/server/media/servicio";
import {
  consultarTarea,
  crearTarea,
  ErrorKie,
  saldoCreditos,
  subirReferencia,
} from "../../apps/web/src/server/proveedores/kie/cliente";

/** Tope duro de la prueba entera, en créditos de KIE. No se sube desde aquí: se decide con el propietario. */
const TOPE = 300;

/** El propietario: la biblioteca a la que se importan los resultados. */
const PROPIETARIO = "0235f38a-0f85-4b47-8524-0856aa489b00";

/** De dónde sale la clave. **Solo de aquí**: ni del entorno, ni de la bóveda, ni de la línea de órdenes. */
const CLAVES = join(import.meta.dir, "..", "..", "docs", "privado", "claves-api.local.md");

const DIR = join(import.meta.dir, "resultados");
const ESTADO = join(DIR, "estado.json");
const ENTRADAS = join(DIR, "entradas.json");
const SONDEO_MS = 10_000;
/** Sondeo largo: un clip de Omni puede tardar minutos y la prueba tiene que poder esperarlo sin reenviar. */
const MAX_TAREA_MS = 20 * 60_000;

const REAL = process.argv.includes("--real");
const SOLO_RECOGER = process.argv.includes("--recoger");

/**
 * Datos del propietario que la prueba necesita y que **no** se guardan en git: los identificadores de sus
 * medios. Viven en `resultados/entradas.json`, que está ignorado, con esta forma:
 *
 * ```json
 * {
 *   "retrato": "<uuid de un medio suyo: la cara del personaje>",
 *   "productoSinMarca": "<uuid: foto frontal de un producto sin logo>",
 *   "productoConLogo": "<uuid: foto frontal de un producto con un logo de marca real>",
 *   "personajeOmni": "<identificador del personaje registrado en KIE>"
 * }
 * ```
 */
interface Entradas {
  retrato: string;
  productoSinMarca: string;
  productoConLogo: string;
  personajeOmni: string;
}

type Referencia = keyof Omit<Entradas, "personajeOmni">;

interface Prueba {
  id: string;
  /** Qué se está midiendo, en castellano. Es lo que da nombre al medio importado. */
  queMide: string;
  modelo: string;
  tipo: "imagen" | "video";
  /** Referencias que se le envían, en orden: primero la identidad, después el producto. */
  referencias: Referencia[];
  /** Estimación prudente en créditos, con la que se comprueba el tope antes de enviar. */
  estimacion: number;
  entrada: (urls: string[], entradas: Entradas) => Record<string, unknown>;
}

/**
 * La regla de la etiqueta es **la misma** que compone el servidor (`direccion/producto.ts`). Se copia aquí a
 * propósito y no se importa: esta prueba mide lo que se le pide al proveedor hoy, y si mañana el texto del
 * servidor cambia, el resultado medido tiene que seguir diciendo con qué texto se midió.
 */
const REGLA_ETIQUETA =
  "The product itself must not be redesigned: keep its label, its packaging, its shape, its colours and every printed word exactly as they are in the product reference images. Do not translate, rewrite, restyle, blur or invent any text, logo or symbol on the product, and do not add any new marking to it.";

const FOTOGRAMA = [
  "Subject: a person in their thirties, exactly as in the first reference image; keep their identity from the reference photographs and do not retouch, slim, smooth or beautify them in any way.",
  "Camera: medium shot, eye level, 35mm, shot on a modern phone.",
  "Context: a bright kitchen with a plain worktop.",
  "Light: soft window light from the left.",
  "Action: the person holds the product in one hand, turned towards the camera, front label facing the lens, fingers away from the label.",
  `Product: the product reference images show the product; reproduce that exact product, and take nothing else from those images. ${REGLA_ETIQUETA}`,
  "Realism: real skin texture with visible pores, correct anatomy, natural imperfections; nothing written on the image, no watermark, nothing deformed.",
].join("\n");

const CLIP = [
  "A phone-shot social video of a person talking straight to camera. Medium shot. Eye level. The camera stays locked off and does not move.",
  "The person is presenting a product on camera and the product stays in frame. The person turns the product towards the camera, front label facing the lens, held steady.",
  REGLA_ETIQUETA,
  "Single continuous take: one uninterrupted shot from first frame to last, no cuts, no edits, no transitions, no scene changes.",
].join("\n");

const PRUEBAS: Prueba[] = [
  {
    id: "1-persona-y-producto",
    queMide: "persona y producto en el mismo fotograma, con dos referencias",
    modelo: "nano-banana-2-lite",
    tipo: "imagen",
    referencias: ["retrato", "productoSinMarca"],
    estimacion: 10,
    entrada: (urls) => ({ prompt: FOTOGRAMA, image_urls: urls, aspect_ratio: "9:16" }),
  },
  {
    id: "2-etiqueta-conservada",
    queMide: "si la etiqueta y el texto del envase se conservan en un primer plano",
    modelo: "seedream/4.5-edit",
    tipo: "imagen",
    referencias: ["retrato", "productoSinMarca"],
    estimacion: 10,
    entrada: (urls) => ({
      prompt: `${FOTOGRAMA}\nThe product fills a third of the frame and its label is fully readable.`,
      image_urls: urls,
      aspect_ratio: "9:16",
      quality: "basic",
    }),
  },
  {
    id: "3-logo-real",
    queMide: "qué hace el filtro del proveedor con un logo de marca real, y si cobra al rechazarlo",
    modelo: "nano-banana-2-lite",
    tipo: "imagen",
    referencias: ["retrato", "productoConLogo"],
    estimacion: 10,
    entrada: (urls) => ({ prompt: FOTOGRAMA, image_urls: urls, aspect_ratio: "9:16" }),
  },
  /**
   * La pregunta que decide la rama de Omni: hoy el servidor **no** manda las dos cosas a la vez porque la
   * documentación no lo confirma. Aquí se envía a propósito para ver qué contesta el proveedor: si lo
   * rechaza (sin cobrar), la decisión provisional 6 de la fase queda confirmada.
   */
  {
    id: "4-omni-identidad-y-referencias",
    queMide: "si Omni acepta character_ids y image_urls a la vez o rechaza la petición",
    modelo: "google/gemini-omni-flash-1-1",
    tipo: "video",
    referencias: ["productoSinMarca"],
    estimacion: 70,
    entrada: (urls, entradas) => ({
      prompt: CLIP,
      image_urls: urls,
      character_ids: [entradas.personajeOmni],
      duration: "4",
      resolution: "720p",
      aspect_ratio: "9:16",
    }),
  },
];

interface Registro {
  modelo: string;
  queMide: string;
  tipo: "imagen" | "video";
  entrada?: Record<string, unknown>;
  taskId?: string;
  enviadoMs?: number;
  terminadoMs?: number;
  estado?: string;
  creditos?: number | null;
  archivo?: string;
  /** Identificador del medio ya importado a la biblioteca del propietario. */
  medioId?: string;
  incidencia?: string;
}

interface Estado {
  saldoInicial?: number;
  saldoFinal?: number;
  pruebas: Record<string, Registro>;
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const motivo = (e: unknown) => (e instanceof ErrorKie ? `ErrorKie:${e.codigo}` : e instanceof Error ? e.name : "error");

async function cargarEstado(): Promise<Estado> {
  const f = Bun.file(ESTADO);
  return (await f.exists()) ? ((await f.json()) as Estado) : { pruebas: {} };
}
const guardar = (e: Estado) => Bun.write(ESTADO, JSON.stringify(e, null, 2));

async function cargarEntradas(): Promise<Entradas> {
  const f = Bun.file(ENTRADAS);
  if (!(await f.exists())) {
    throw new Error(
      `Faltan las entradas de la prueba en ${ENTRADAS}. Escribe ahí los identificadores de los medios del propietario (ver la cabecera de este fichero).`,
    );
  }
  return (await f.json()) as Entradas;
}

/**
 * Lee la clave de KIE **del documento privado**, nunca del entorno ni de la bóveda. No se devuelve por
 * ningún otro camino, no se imprime y no se escribe en `estado.json`: solo se pasa al cliente de KIE.
 */
async function claveDeKie(): Promise<string> {
  const fichero = Bun.file(CLAVES);
  if (!(await fichero.exists())) {
    throw new Error(`No está el documento privado de claves en ${CLAVES}. La prueba no se ejecuta sin él.`);
  }
  for (const linea of (await fichero.text()).split("\n")) {
    if (!linea.includes("KIE_API_KEY")) continue;
    const valor =
      linea
        .split(/\s[-–]\s/)
        .at(-1)
        ?.replace(/\\/g, "")
        .trim() ?? "";
    if (valor !== "" && !valor.includes("KIE_API_KEY")) return valor;
  }
  throw new Error(`No se ha encontrado la clave de KIE (KIE_API_KEY) en ${CLAVES}.`);
}

/** Copia local de un medio del propietario; devuelve su ruta y su tipo. */
async function bajarMedio(id: string, nombre: string): Promise<{ ruta: string; mime: string }> {
  const { leerObjeto } = await import("../../apps/web/src/server/almacenamiento");
  const sql = new Bun.SQL(process.env.DATABASE_URL ?? "");
  const [fila] = await sql`select storage_key, mime_type from media where id = ${id} and owner_id = ${PROPIETARIO}`;
  await sql.close();
  if (!fila) throw new Error(`El medio ${id} no existe o no es del propietario.`);
  const mime = String(fila.mime_type);
  const ruta = join(DIR, `${nombre}.${mime.split("/")[1]}`);
  if (!(await Bun.file(ruta).exists())) await Bun.write(ruta, await leerObjeto(fila.storage_key).arrayBuffer());
  return { ruta, mime };
}

/** Lo gastado hasta ahora, por lo alto: lo que informan las tareas o la caída real del saldo, lo que sea mayor. */
function gastado(estado: Estado, saldoActual: number): number {
  const porTareas = Object.values(estado.pruebas).reduce((s, r) => s + (r.creditos ?? 0), 0);
  const porSaldo = estado.saldoInicial === undefined ? 0 : estado.saldoInicial - saldoActual;
  return Math.max(porTareas, porSaldo);
}

/** Sondeo largo de una tarea ya creada. **Nunca envía nada**: si no termina, se deja para `--recoger`. */
async function sondear(clave: string, id: string, estado: Estado): Promise<void> {
  const r = estado.pruebas[id];
  if (!r?.taskId) return;
  const inicio = Date.now();
  while (Date.now() - inicio < MAX_TAREA_MS) {
    try {
      const tarea = await consultarTarea(clave, r.taskId);
      r.estado = tarea.estado;
      if (tarea.creditos !== null) r.creditos = tarea.creditos;
      if (tarea.estadoPropio === "listo") {
        r.terminadoMs ??= Date.now();
        const respuesta = await fetch(String(tarea.urls[0]));
        const tipo = respuesta.headers.get("content-type") ?? "";
        const ext = r.tipo === "video" ? "mp4" : (tipo.split("/")[1]?.split(";")[0] ?? "png");
        r.archivo = `${id}.${ext}`;
        await Bun.write(join(DIR, r.archivo), await respuesta.arrayBuffer());
        await guardar(estado);
        console.log(`  ✓ ${id}: ${r.creditos ?? "?"} créditos`);
        return;
      }
      if (tarea.haFallado || tarea.estadoPropio === "desconocido") {
        r.incidencia = `Estado del proveedor: ${tarea.estado}`;
        await guardar(estado);
        // Lo que más interesa de la prueba del logo: si rechaza, cuánto ha cobrado.
        console.log(`  ✗ ${id}: ${tarea.estado} · créditos informados: ${r.creditos ?? 0}`);
        return;
      }
    } catch (error) {
      console.log(`  … ${id}: fallo al consultar (${motivo(error)}); se reintenta la consulta, no el envío`);
    }
    await guardar(estado);
    await esperar(SONDEO_MS);
  }
  r.incidencia = "Sin terminar dentro del sondeo. No se ha reenviado nada: vuelve con --recoger.";
  await guardar(estado);
  console.log(`  ⏱ ${id}: sigue en vuelo. Vuelve con --recoger.`);
}

/** Importa a la biblioteca del propietario lo que haya terminado, con un nombre que dice qué prueba. */
async function importar(estado: Estado): Promise<void> {
  const actor = { id: PROPIETARIO, esAdmin: true };
  for (const [id, r] of Object.entries(estado.pruebas)) {
    if (!r.archivo || r.medioId) continue;
    const ruta = join(DIR, r.archivo);
    const datos = await Bun.file(ruta).arrayBuffer();
    const extension = r.archivo.split(".").at(-1) ?? "png";
    const nombre = `Prueba de producto · ${id} · ${r.queMide}.${extension}`;
    const medio = await crearMedio(
      actor,
      new File([datos], nombre, { type: r.tipo === "video" ? "video/mp4" : `image/${extension}` }),
    );
    r.medioId = medio.id;
    await guardar(estado);
    console.log(`  ↳ importado a la biblioteca: ${nombre}`);
  }
}

async function main(): Promise<void> {
  await mkdir(DIR, { recursive: true });
  const entradas = await cargarEntradas();

  if (!REAL && !SOLO_RECOGER) {
    console.log(`ENSAYO: no se lee la clave, no se llama a nadie y no se gasta nada. Tope duro: ${TOPE} créditos.`);
    let suma = 0;
    for (const prueba of PRUEBAS) {
      suma += prueba.estimacion;
      console.log(`\n${prueba.id} · ${prueba.modelo} · ${prueba.queMide} · estimación ${prueba.estimacion}`);
      console.log(
        JSON.stringify(
          prueba.entrada(
            prueba.referencias.map((r) => `<URL:${r}>`),
            entradas,
          ),
          null,
          2,
        ),
      );
    }
    console.log(`\nEstimación total prudente: ${suma} créditos. El tope corta en ${TOPE}.`);
    return;
  }

  const clave = await claveDeKie();
  const estado = await cargarEstado();
  const saldo = await saldoCreditos(clave);
  estado.saldoInicial ??= saldo;
  await guardar(estado);
  console.log(`Saldo inicial: ${estado.saldoInicial} · actual ${saldo} · tope ${TOPE}`);

  // Primero se recoge lo que quedó en vuelo. Una tarea con identificador **solo se consulta**.
  for (const id of Object.keys(estado.pruebas)) {
    const r = estado.pruebas[id];
    if (r?.taskId && !r.archivo && !r.incidencia) await sondear(clave, id, estado);
  }

  if (!SOLO_RECOGER) {
    const urls: Partial<Record<Referencia, string>> = {};
    for (const prueba of PRUEBAS) {
      if (estado.pruebas[prueba.id]) continue;
      const ya = gastado(estado, await saldoCreditos(clave));
      if (ya + prueba.estimacion > TOPE) {
        const nota = `No enviada: ${ya} gastados + ${prueba.estimacion} estimados pasarían del tope de ${TOPE}.`;
        estado.pruebas[prueba.id] = {
          modelo: prueba.modelo,
          queMide: prueba.queMide,
          tipo: prueba.tipo,
          incidencia: nota,
        };
        await guardar(estado);
        console.log(`■ ${prueba.id}: ${nota}`);
        continue;
      }
      try {
        for (const referencia of prueba.referencias) {
          if (urls[referencia]) continue;
          const { ruta, mime } = await bajarMedio(entradas[referencia], referencia);
          const archivo = new File([await Bun.file(ruta).arrayBuffer()], `${referencia}.${mime.split("/")[1]}`, {
            type: mime,
          });
          urls[referencia] = await subirReferencia(clave, archivo);
        }
        const entrada = prueba.entrada(
          prueba.referencias.map((r) => String(urls[r])),
          entradas,
        );
        const registro: Registro = {
          modelo: prueba.modelo,
          queMide: prueba.queMide,
          tipo: prueba.tipo,
          entrada,
          enviadoMs: Date.now(),
        };
        // Se escribe **antes** de tener identificador y se vuelve a escribir en cuanto lo hay: así, un corte
        // entre las dos cosas deja constancia de que se intentó y la prueba no se reenvía a ciegas.
        estado.pruebas[prueba.id] = registro;
        await guardar(estado);
        console.log(`→ ${prueba.id} (${prueba.modelo}) · gastado ${ya} · estimación ${prueba.estimacion}`);
        registro.taskId = await crearTarea(clave, prueba.modelo, entrada);
        await guardar(estado);
        await sondear(clave, prueba.id, estado);
      } catch (error) {
        const previo = estado.pruebas[prueba.id];
        estado.pruebas[prueba.id] = {
          ...(previo ?? { modelo: prueba.modelo, queMide: prueba.queMide, tipo: prueba.tipo }),
          incidencia: `Envío fallido (${motivo(error)}). No se reintenta.`,
        };
        await guardar(estado);
        console.log(`  ✗ ${prueba.id}: envío fallido (${motivo(error)})`);
      }
    }
  }

  await importar(estado);
  estado.saldoFinal = await saldoCreditos(clave);
  await guardar(estado);
  console.log(
    `Saldo final: ${estado.saldoFinal}. Gastado de verdad: ${(estado.saldoInicial ?? 0) - (estado.saldoFinal ?? 0)} de ${TOPE}.`,
  );
}

await main();
