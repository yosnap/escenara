/**
 * Comprueba el presupuesto de JavaScript por ruta sobre el build de producción. Corre al final de `bun run build`
 * y hace fallar el build si una ruta supera su tope.
 *
 * Uso suelto: `bun scripts/presupuesto-js.ts [carpeta-del-build] [fichero-de-topes]` (por defecto `.next` y
 * `presupuesto-js.json` de la app). Los argumentos existen para el test, que lo prueba sobre un build de mentira.
 */
import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import {
  comprobarPresupuestos,
  entradasDeCliente,
  ficherosDeRuta,
  instruccionesDeAlta,
  leerManifiestoCliente,
  type MedidaRuta,
  medidasDesfasadas,
  rutaDeClave,
  sumarKb,
  tablaPresupuestos,
  topesSinRuta,
  validarPresupuestos,
} from "../src/lib/presupuesto-js";

const web = path.resolve(import.meta.dir, "..");
const build = path.resolve(process.argv[2] ?? path.join(web, ".next"));
const presupuestos = validarPresupuestos(
  await Bun.file(path.resolve(process.argv[3] ?? path.join(web, "presupuesto-js.json"))).json(),
);

const manifiestoBuild = Bun.file(path.join(build, "build-manifest.json"));
if (!(await manifiestoBuild.exists())) {
  console.error("No hay build de producción: ejecuta antes `bun run build`.");
  process.exit(1);
}
const { rootMainFiles } = (await manifiestoBuild.json()) as { rootMainFiles: string[] };

const cache = new Map<string, number>();
const bytesGzip = (fichero: string): number => {
  const previo = cache.get(fichero);
  if (previo !== undefined) return previo;
  const ruta = path.join(build, fichero);
  const bytes = Bun.gzipSync(readFileSync(ruta)).byteLength;
  cache.set(fichero, bytes);
  return bytes;
};

/** Trozos de servidor que carga una página (`__webpack_require__.X(0, [ids], …)`): ahí viven parte de sus proxies. */
const trozosDeServidor = async (pagina: string): Promise<string[]> => {
  const ids = /\.X\(0,\[([\d,]*)\]/.exec(pagina)?.[1]?.split(",").filter(Boolean) ?? [];
  const fuentes: string[] = [];
  for (const id of ids) {
    const trozo = Bun.file(path.join(build, "server/chunks", `${id}.js`));
    if (await trozo.exists()) fuentes.push(await trozo.text());
  }
  return fuentes;
};

const medidas: MedidaRuta[] = [];
const appServidor = path.join(build, "server/app");
for (const relativo of await readdir(appServidor, { recursive: true })) {
  if (!relativo.endsWith("page_client-reference-manifest.js")) continue;
  const { clave, manifiesto } = leerManifiestoCliente(await Bun.file(path.join(appServidor, relativo)).text());
  if (clave.startsWith("/_")) continue; // páginas internas de Next (_not-found, _global-error)
  const pagina = await Bun.file(
    path.join(appServidor, relativo.replace("_client-reference-manifest.js", ".js")),
  ).text();
  const fuentes = [pagina, ...(await trozosDeServidor(pagina))];
  const ficheros = ficherosDeRuta(rootMainFiles, manifiesto, entradasDeCliente(manifiesto, fuentes));
  medidas.push({ ruta: rutaDeClave(clave), ficheros, kb: sumarKb(ficheros, bytesGzip) });
}

// Sin ninguna ruta medida no se da por bueno nada: lo normal es que Next haya cambiado el formato de sus manifiestos.
if (medidas.length === 0) {
  console.error("No se ha encontrado ninguna página en el build: revisa el formato de los manifiestos de Next.");
  process.exit(1);
}
const resultados = comprobarPresupuestos(medidas, presupuestos);
console.log("\nPresupuesto de JavaScript por ruta (primera carga, gzip):");
console.log(tablaPresupuestos(resultados));

for (const ruta of topesSinRuta(medidas, presupuestos)) {
  console.warn(`Aviso: «${ruta}» está en presupuesto-js.json pero ya no es ninguna ruta del build; quítala.`);
}
for (const aviso of medidasDesfasadas(medidas, presupuestos)) console.warn(`Aviso: ${aviso}`);

const sinAlta = resultados.filter((r) => r.sinAlta);
const pasadas = resultados.filter((r) => !r.pasa && !r.sinAlta);
if (sinAlta.length > 0) {
  console.error(`\n${sinAlta.length} ruta(s) nuevas sin dar de alta en el presupuesto:`);
  for (const r of sinAlta) console.error(`  - ${instruccionesDeAlta(r.ruta, r.kb)}`);
}
if (pasadas.length > 0) {
  console.error(
    `\n${pasadas.length} ruta(s) superan su presupuesto de JavaScript: ${pasadas.map((r) => `${r.ruta} (${r.kb} KB > ${r.topeKb} KB)`).join(", ")}.`,
  );
  console.error("Reduce el JavaScript de la ruta (carga diferida, componentes de servidor) antes de subir el tope.");
}
if (sinAlta.length + pasadas.length > 0) {
  // Salida de emergencia documentada (docs/procesos/medir-el-rendimiento.md): solo para no bloquear un despliegue
  // urgente; el fallo se sigue viendo en el registro del build y hay que arreglarlo después.
  if (process.env.PRESUPUESTO_JS_SOLO_AVISO === "1") {
    console.warn(
      "\nPRESUPUESTO_JS_SOLO_AVISO=1: el build sigue, pero el presupuesto NO se cumple. Arréglalo cuanto antes.",
    );
  } else {
    process.exit(1);
  }
} else {
  console.log(`\nTodas las rutas (${resultados.length}) caben en su presupuesto.`);
}
