import { readFileSync } from "node:fs";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

/**
 * **Spike de la dirección del clip.** Genera unos pocos clips reales para responder tres preguntas que no se
 * pueden responder leyendo documentación:
 *
 * 1. ¿el orden del prompt (cámara → sujeto → gesto → guion → voz → toma única) es el que más se respeta?
 * 2. ¿la regla de toma única evita de verdad que el modelo corte a media frase?
 * 3. ¿se oye el acento que se pide?
 *
 * **Gasta créditos de verdad** y por eso lleva tres cerrojos: la variable de entorno
 * `ESCENARA_SPIKE_DIRECCION=1`, el argumento `--ejecutar` y un `--tope` en créditos que hay que escribir a
 * mano. Sin `--ejecutar` solo imprime el plan y el coste, y no habla con nadie.
 *
 * **El tope es duro.** Antes de cada clip se comprueba que lo ya gastado más el precio publicado de uno más
 * cabe en el tope; si no cabe, se para y se dice cuántos quedaron sin hacer. Lo que se suma es el precio
 * **que informa el proveedor** en cada tarea, no el estimado: la regla de dinero de siempre.
 *
 * **La clave nunca se imprime.** Se lee del documento privado que está fuera de git y se pasa al adaptador;
 * no aparece en la salida, ni en los ficheros del resumen, ni en ningún mensaje de error (el contrato del
 * adaptador ya prohíbe conservar el texto del proveedor por eso mismo).
 *
 * Uso (desde `apps/web`):
 *   bun scripts/spike-direccion.ts                                          # plan y coste, sin gastar nada
 *   ESCENARA_SPIKE_DIRECCION=1 bun scripts/spike-direccion.ts --ejecutar --tope 504 --salida /ruta/scratchpad
 *
 * Al terminar, anota el presupuesto y el resultado en `docs/recursos/apis-y-proveedores.md` y cierra las
 * decisiones provisionales 10 y 11 de la fase.
 */

loadEnvConfig(path.resolve(import.meta.dirname, "../../.."), true, console, true);

/**
 * Modelo del spike: el mismo que producirá las escenas habladas (decisión firme 9). Se usa **sin personaje
 * registrado**, que es la tarifa «no video input» que publica KIE: así el spike no obliga a registrar una cara
 * ni a generar retratos, que serían créditos gastados en algo que el spike no mide.
 */
const MODELO = "google/gemini-omni-flash-1-1";
const SEGUNDOS = 4;
const RESOLUCION = "720p";
const PROPORCION = "9:16";

/** Créditos publicados de esa combinación (4 s, 720p, sin vídeo de entrada). Se reconfirma al arrancar. */
const CREDITOS_PUBLICADOS = 63;

/** Lo que dice el personaje en todos los clips. La misma frase en todos: lo que varía es **una** cosa. */
const DIALOGO = "Te voy a contar una cosa que casi nadie sabe, y que a mí me cambió la semana.";

interface CasoDelSpike {
  clave: string;
  pregunta: string;
  /** Qué cambia respecto a los demás. Todo lo demás se deja igual a propósito. */
  varia: string;
  /** Clave del preset de cámara del catálogo; vacío = cámara quieta. */
  camara: string;
  /** Clave del preset de micro-acción; vacío = ninguna. */
  microaccion: string;
  momento: "antes" | "durante" | "despues";
  acento: "es_ES_madrid" | "es_AR_rioplatense";
}

/**
 * Ocho clips: tres que varían solo la cámara, tres que varían solo el gesto y su momento, y dos que varían
 * solo el acento. **Una variable por clip**: si se cambian dos, el resultado no dice cuál de las dos lo
 * explica y el dinero se ha gastado para nada.
 */
const CASOS: readonly CasoDelSpike[] = [
  {
    clave: "camara-quieta",
    pregunta: "¿Se queda quieta de verdad?",
    varia: "cámara: quieta con gestos",
    camara: "quieta-con-gestos",
    microaccion: "",
    momento: "durante",
    acento: "es_ES_madrid",
  },
  {
    clave: "camara-zoom-lento",
    pregunta: "¿Hace el acercamiento y sin cortar?",
    varia: "cámara: zoom lento a la cara",
    camara: "zoom-lento-cara",
    microaccion: "",
    momento: "durante",
    acento: "es_ES_madrid",
  },
  {
    clave: "camara-orbita",
    pregunta: "¿Orbita o parte el plano?",
    varia: "cámara: órbita lenta",
    camara: "orbita-lenta",
    microaccion: "",
    momento: "durante",
    acento: "es_ES_madrid",
  },
  {
    clave: "gesto-antes",
    pregunta: "¿Asiente ANTES de hablar?",
    varia: "micro-acción: asiente, antes",
    camara: "",
    microaccion: "asentir",
    momento: "antes",
    acento: "es_ES_madrid",
  },
  {
    clave: "gesto-durante",
    pregunta: "¿Asiente MIENTRAS habla?",
    varia: "micro-acción: asiente, durante",
    camara: "",
    microaccion: "asentir",
    momento: "durante",
    acento: "es_ES_madrid",
  },
  {
    clave: "gesto-despues",
    pregunta: "¿Asiente DESPUÉS de hablar?",
    varia: "micro-acción: asiente, después",
    camara: "",
    microaccion: "asentir",
    momento: "despues",
    acento: "es_ES_madrid",
  },
  {
    clave: "acento-madrid",
    pregunta: "¿Se oye peninsular?",
    varia: "acento: España (Madrid)",
    camara: "",
    microaccion: "",
    momento: "durante",
    acento: "es_ES_madrid",
  },
  {
    clave: "acento-rioplatense",
    pregunta: "¿Se oye rioplatense?",
    varia: "acento: rioplatense",
    camara: "",
    microaccion: "",
    momento: "durante",
    acento: "es_AR_rioplatense",
  },
];

/** Lo que hay que mirar en cada clip al recibirlo. Se anota a mano: esto no lo decide ningún modelo. */
const QUE_MIRAR = [
  "¿Hay algún corte, transición o cambio de plano? (si lo hay, la regla de toma única no basta)",
  "¿Se termina la frase dentro del clip o se corta a media palabra?",
  "¿El movimiento de cámara es el que se pidió?",
  "¿El gesto ocurre en el momento que se pidió respecto a la frase?",
  "¿El acento es el que se pidió?",
];

const argumento = (nombre: string): string | null => {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
};

/** `--solo a,b,c` ejecuta solo esos casos. Sirve para retomar un spike a medias sin repetir lo ya pagado. */
const solo = (argumento("solo") ?? "")
  .split(",")
  .map((c) => c.trim())
  .filter((c) => c !== "");
const casos = solo.length === 0 ? CASOS : CASOS.filter((c) => solo.includes(c.clave));

const tope = Number(argumento("tope") ?? 0);
const ejecutar = process.argv.includes("--ejecutar");
const coste = casos.length * CREDITOS_PUBLICADOS;

console.log(`Spike de la dirección del clip: ${casos.length} clips de ${SEGUNDOS} s con ${MODELO}.`);
console.log(`Coste estimado: ${coste} créditos (${CREDITOS_PUBLICADOS} por clip, tarifa publicada).\n`);
for (const caso of casos) console.log(`  ${caso.clave.padEnd(22)} ${caso.varia.padEnd(38)} ${caso.pregunta}`);
console.log("\nQué mirar en cada clip al recibirlo:");
for (const linea of QUE_MIRAR) console.log(`  - ${linea}`);

if (!ejecutar) {
  console.log("\nNo se ha gastado nada: esto es solo el plan. Añade --ejecutar para generarlos de verdad.");
  process.exit(0);
}

if (process.env.ESCENARA_SPIKE_DIRECCION !== "1") {
  console.error(
    "\nEl spike está apagado. Exporta ESCENARA_SPIKE_DIRECCION=1 solo si el propietario lo ha aprobado: gasta créditos.",
  );
  process.exit(1);
}

if (!(tope >= CREDITOS_PUBLICADOS)) {
  console.error(`\nFalta el tope de presupuesto. Pasa --tope con al menos ${CREDITOS_PUBLICADOS} créditos.`);
  process.exit(1);
}

const salida = argumento("salida");
if (!salida) {
  console.error("\nFalta --salida: la carpeta donde se guardan los vídeos y el resumen (fuera del repositorio).");
  process.exit(1);
}

/**
 * Lee la clave de KIE del documento privado, que está fuera de git.
 *
 * **No se imprime nunca**, ni entera ni en trozos: se devuelve y se pasa al adaptador. Se acepta tanto
 * `KIE_API_KEY=...` como una línea de ficha con la clave detrás de dos puntos, que son las dos formas en las
 * que el documento la puede tener escrita.
 */
function claveDeKie(): string {
  const deEntorno = process.env.KIE_API_KEY?.trim();
  if (deEntorno) return deEntorno;
  const documento = path.resolve(import.meta.dirname, "../../../../escenara/docs/privado/claves-api.local.md");
  let texto: string;
  try {
    texto = readFileSync(documento, "utf8");
  } catch {
    throw new Error(
      "No se ha podido leer el documento privado de claves. Exporta KIE_API_KEY o comprueba que el documento existe.",
    );
  }
  for (const linea of texto.split("\n")) {
    if (!/kie/i.test(linea)) continue;
    const encontrado = /(sk-[A-Za-z0-9_-]{12,}|[A-Za-z0-9]{32,})/.exec(linea);
    if (encontrado?.[1]) return encontrado[1];
  }
  throw new Error("El documento privado no tiene ninguna clave de KIE reconocible. Exporta KIE_API_KEY.");
}

const { dirigirClip } = await import("../src/server/direccion/clip");
const { EJES_VOZ_POR_DEFECTO } = await import("../src/lib/direccion");
const { adaptadorDe } = await import("../src/server/proveedores/registro");
const { ErrorProveedor } = await import("../src/server/proveedores/contrato");
const { descargarTarifas } = await import("../src/server/proveedores/kie/precios-publicos");
const presetsJson = (await import("../src/server/prompts/presets.json")).default as {
  presets: { categoria: string; clave: string; valores: { prompt?: string } }[];
};

/** Fragmento en inglés de un preset del catálogo sembrado. Es el mismo texto que usará la producción. */
const fragmento = (categoria: string, clave: string): string =>
  clave === ""
    ? ""
    : (presetsJson.presets.find((p) => p.categoria === categoria && p.clave === clave)?.valores.prompt ?? "");

/** Prompt de un caso, compuesto con el **mismo** compositor que usa la producción. */
function promptDe(caso: CasoDelSpike): string {
  const movimiento = fragmento("camara", caso.camara);
  const { escena } = dirigirClip(
    {
      formato: "ugc_a_camara",
      movimientosCamara: movimiento === "" ? [] : [movimiento],
      nivelCamara: "basico",
      plano: fragmento("plano", "medio"),
      angulo: fragmento("angulo", "tres-cuartos"),
      registroEstetico: "ugc_real",
      sujeto: "A woman in her thirties",
      escena: fragmento("localizacion", "cocina"),
      microaccion: fragmento("microaccion", caso.microaccion),
      momentoMicroaccion: caso.momento,
      dialogo: DIALOGO,
      direccionVocal: "",
      ejesVoz: EJES_VOZ_POR_DEFECTO,
      acento: caso.acento,
    },
    // Sin personaje registrado no hay hueco aparte para la frase: va dentro del texto, como en la familia
    // genérica. Es lo único que cambia respecto a lo que enviará la producción con Omni.
    { dialogoDentro: true },
  );
  return escena;
}

const clave = claveDeKie();
const adaptador = adaptadorDe("kie");
const carpeta = path.resolve(salida);
await mkdir(carpeta, { recursive: true });

interface ResultadoCaso {
  clave: string;
  varia: string;
  pregunta: string;
  taskId: string;
  estado: string;
  creditos: number | null;
  archivo: string;
  prompt: string;
  fallo: string;
}

/**
 * **Recoger** los vídeos de tareas que ya están pagadas, sin crear ninguna nueva.
 *
 * Existe porque una tarea pagada cuyo identificador se pierde es dinero tirado, y en este spike pasó: el
 * sondeo comparaba el estado con un valor que no existe en el contrato (`completado` en vez de `listo`) y se
 * rendía con la tarea ya cobrada. Con `--recoger` se vuelve a por lo que se pagó, leyendo `tareas.txt`.
 */
if (process.argv.includes("--recoger")) {
  const lineas = readFileSync(path.join(carpeta, "tareas.txt"), "utf8").split("\n").filter(Boolean);
  for (const linea of lineas) {
    const [clave_, taskId] = linea.split("\t");
    if (!clave_ || !taskId) continue;
    const estado = await adaptador.consultar({ clave, taskId, buscar: fetch });
    const url = estado.urls[0];
    if (!url) {
      console.log(`· ${clave_}: ${estado.estadoPropio}, todavía sin archivo.`);
      continue;
    }
    const respuesta = await fetch(url);
    if (!respuesta.ok) {
      console.log(`· ${clave_}: el archivo ya no se puede descargar (las URL del proveedor caducan).`);
      continue;
    }
    const destino = path.join(carpeta, `${clave_}.mp4`);
    await writeFile(destino, Buffer.from(await respuesta.arrayBuffer()));
    console.log(`· ${clave_}: recogido (${estado.creditos ?? "?"} cr.) → ${path.basename(destino)}`);
  }
  process.exit(0);
}

const resultados: ResultadoCaso[] = [];
let gastado = 0;
let saltados = 0;

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Sondea una tarea hasta que termina o se agota el tiempo.
 *
 * El margen es de **quince minutos** y no de cinco: con un personaje registrado Omni Flash tardó 38 s (medido
 * el 2026-09-28), pero sin registrar tarda bastante más, y rendirse antes de tiempo deja la tarea pagada y sin
 * recoger. Eso fue exactamente lo que pasó en el primer intento de este spike.
 *
 * Cada sondeo se escribe en la salida: una tarea que se pierde de vista es dinero gastado del que no queda
 * ni el identificador.
 */
async function esperarTarea(clave_: string, taskId: string) {
  for (let intento = 0; intento < 180; intento++) {
    await esperar(5000);
    const estado = await adaptador.consultar({ clave: clave_, taskId, buscar: fetch });
    if (intento % 6 === 0) {
      console.log(`    · sondeo ${intento}: ${estado.estado} → ${estado.estadoPropio}, ${estado.creditos ?? "?"} cr.`);
    }
    if (estado.estadoPropio === "listo" || estado.haFallado) return estado;
  }
  return null;
}

try {
  const saldo = await adaptador.probarCredencial({ clave, buscar: fetch });
  console.log(`\nSaldo en KIE antes de empezar: ${saldo ?? "no informado"} créditos.`);

  // Se reconfirma la tarifa publicada antes de gastar: si KIE la ha subido, el tope tiene que contarla bien.
  const tarifas = await descargarTarifas();
  const tarifa = tarifas.find(
    (t) => t.descripcion.includes(MODELO) && t.descripcion.includes(`${SEGUNDOS}s ${RESOLUCION} no video input`),
  );
  const porClip = tarifa?.creditos ?? CREDITOS_PUBLICADOS;
  if (porClip !== CREDITOS_PUBLICADOS) {
    console.log(`Aviso: la tarifa publicada ahora es ${porClip} créditos por clip, no ${CREDITOS_PUBLICADOS}.`);
  }
  console.log(`Tope duro: ${tope} créditos. Tarifa por clip: ${porClip}.\n`);

  for (const caso of casos) {
    // El tope se comprueba **antes** de pedir nada: pasarse y luego disculparse no es un tope.
    if (gastado + porClip > tope) {
      console.log(`· ${caso.clave}: NO se pide, no cabe en el tope (${gastado} + ${porClip} > ${tope}).`);
      saltados++;
      continue;
    }
    const prompt = promptDe(caso);
    const entrada: Record<string, unknown> = {
      prompt,
      duration: String(SEGUNDOS),
      resolution: RESOLUCION,
      aspect_ratio: PROPORCION,
    };

    let taskId = "";
    let fallo = "";
    // Un fallo **sin cobrar** se reintenta una sola vez; uno que pudo cobrarse, ninguna.
    for (let intento = 0; intento < 2 && taskId === ""; intento++) {
      try {
        taskId = await adaptador.generarVideo({ clave, modelo: MODELO, entrada, buscar: fetch });
      } catch (error) {
        if (error instanceof ErrorProveedor) {
          fallo = `${error.motivo}/${error.codigo}`;
          if (!error.sinCoste) break;
          console.log(`· ${caso.clave}: rechazado sin coste (${fallo}); un reintento.`);
        } else {
          fallo = (error as Error).name;
          break;
        }
      }
    }

    if (taskId === "") {
      console.log(`· ${caso.clave}: no se ha creado la tarea (${fallo}).`);
      resultados.push({ ...caso, taskId: "", estado: "no creada", creditos: null, archivo: "", prompt, fallo });
      continue;
    }

    // El identificador se guarda **en cuanto existe**, antes de sondear: si esto se cae o se interrumpe, la
    // tarea ya está pagada y sin su identificador no hay forma de recuperar el vídeo.
    console.log(`· ${caso.clave}: tarea ${taskId} creada.`);
    await appendFile(path.join(carpeta, "tareas.txt"), `${caso.clave}\t${taskId}\n`);

    const estado = await esperarTarea(clave, taskId);
    const creditos = estado?.creditos ?? null;
    // Lo que se suma es lo que informa el proveedor; si no lo informa, la tarifa publicada, que es lo
    // prudente: dar por gastado menos de lo que puede haber costado rompería el tope sin avisar.
    gastado += creditos ?? porClip;

    let archivo = "";
    const url = estado?.urls[0];
    if (url) {
      const respuesta = await fetch(url);
      if (respuesta.ok) {
        archivo = path.join(carpeta, `${caso.clave}.mp4`);
        await writeFile(archivo, Buffer.from(await respuesta.arrayBuffer()));
      }
    }
    console.log(
      `· ${caso.clave}: ${estado?.estadoPropio ?? "sin respuesta"}, ${creditos ?? "?"} créditos` +
        ` (acumulado ${gastado}/${tope})${archivo ? ` → ${path.basename(archivo)}` : ""}`,
    );
    resultados.push({
      ...caso,
      taskId,
      estado: estado?.estadoPropio ?? "sin respuesta",
      creditos,
      archivo,
      prompt,
      fallo: estado?.haFallado ? "el proveedor lo marcó como fallido" : "",
    });
  }

  const resumen = [
    `# Spike de la dirección del clip · ${new Date().toISOString().slice(0, 10)}`,
    "",
    `- Modelo: ${MODELO}, ${SEGUNDOS} s, ${RESOLUCION}, ${PROPORCION}, sin personaje registrado.`,
    `- Tope: ${tope} créditos. Gastado: ${gastado}. Clips pedidos: ${resultados.length}. Saltados: ${saltados}.`,
    "",
    "| Caso | Qué varía | Estado | Créditos | Archivo |",
    "|---|---|---|---|---|",
    ...resultados.map(
      (r) =>
        `| ${r.clave} | ${r.varia} | ${r.estado}${r.fallo ? ` (${r.fallo})` : ""} | ${r.creditos ?? "?"} | ${r.archivo ? path.basename(r.archivo) : "—"} |`,
    ),
    "",
    "## Qué mirar",
    ...QUE_MIRAR.map((q) => `- ${q}`),
    "",
    "## Prompt enviado en cada caso",
    ...resultados.flatMap((r) => ["", `### ${r.clave}`, "", "```", r.prompt, "```"]),
  ].join("\n");
  await writeFile(path.join(carpeta, "resumen.md"), resumen);
  console.log(`\nGastado: ${gastado} de ${tope} créditos. Resumen y vídeos en ${carpeta}.`);
} catch (error) {
  // El mensaje del proveedor no se imprime tal cual: puede repetir la clave recibida (contrato del adaptador).
  if (error instanceof ErrorProveedor) {
    console.error(`El proveedor ha fallado (motivo ${error.motivo}, código ${error.codigo}).`);
  } else {
    console.error(`Fallo inesperado: ${(error as Error).name}`);
  }
  console.error(`Gastado hasta el fallo: ${gastado} créditos.`);
  process.exitCode = 1;
}
