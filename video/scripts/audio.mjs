// Construye la línea de tiempo y el audio final del vídeo a partir de las tomas
// de voz elegidas (salida/publico/voz/*.wav):
//  1. tiempos.json: inicio/fin de cada escena, palabras con marca de tiempo
//     (whisper local), subtítulos y efectos. Remotion lo lee para sincronizar.
//  2. música y efectos sintetizados (scripts/musica.mjs, scripts/sintesis.mjs).
//  3. mezcla con ducking de la música bajo la voz y normalización a −16 LUFS,
//     pico real < −1 dBTP (loudnorm en dos pasadas).
//  4. subtítulos .srt con el texto del guion.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { duracion, FPS, leerGuion, PUBLICO, SALIDA } from "./comun.mjs";
import { componerMusica } from "./musica.mjs";
import { campanita, clic, escribirWav, estereo, impacto, pop, SR, subidon, sumar, whoosh } from "./sintesis.mjs";
import { equilibrar, trocear } from "./subtitulos.mjs";

const WHISPER_MODELO = process.env.WHISPER_MODELO ?? join(SALIDA, "modelos", "ggml-large-v3-turbo-q5_0.bin");
const DIR_AUDIO = join(SALIDA, "audio");
mkdirSync(DIR_AUDIO, { recursive: true });

// Ritmo: entrada antes de la voz y respiración después de cada frase
const ENTRADA_PRIMERA = 1.2;
const ENTRADA = 0.5;
const RESPIRO = 1.0;
const COLA_FINAL = 3.6;
// Las frases cortas necesitan un mínimo para que se lea lo que se ve
const MIN_ESCENA = 5.5;

const cuadro = (t) => Math.round(t * FPS) / FPS;
const norm = (t) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");

function palabrasDe(wav) {
  const tmp = join(DIR_AUDIO, "whisper.wav");
  const base = join(DIR_AUDIO, "whisper");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", wav, "-ar", "16000", "-ac", "1", tmp]);
  const r = spawnSync(
    "whisper-cli",
    ["-m", WHISPER_MODELO, "-l", "es", "-ml", "1", "-sow", "-oj", "-of", base, "-np", "-f", tmp],
    { encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(`whisper-cli falló con ${wav}: ${r.stderr.slice(-400)}`);
  const json = JSON.parse(readFileSync(`${base}.json`, "utf8"));
  rmSync(tmp, { force: true });
  rmSync(`${base}.json`, { force: true });
  return json.transcription
    .map((s) => ({ texto: s.text.trim(), t0: s.offsets.from / 1000, t1: s.offsets.to / 1000 }))
    .filter((p) => norm(p.texto));
}

function subtitulosDe(escena, palabras, vozInicio) {
  const trozos = trocear(escena.subtitulo);
  const totalGuion = trozos.reduce((n, t) => n + t.length, 0);
  const W = palabras.length;
  let acumulado = 0;
  const salida = trozos.map((t) => {
    const i = Math.min(W - 1, Math.round((acumulado * W) / totalGuion));
    acumulado += t.length;
    const j = Math.min(W - 1, Math.max(i, Math.round((acumulado * W) / totalGuion) - 1));
    return {
      texto: equilibrar(t),
      inicio: cuadro(vozInicio + palabras[i].t0 - 0.05),
      fin: cuadro(vozInicio + palabras[j].t1 + 0.15),
    };
  });
  // Encadenados: cada uno llega hasta el siguiente (sin huecos ni solapes)
  for (let k = 0; k < salida.length - 1; k++) salida[k].fin = salida[k + 1].inicio;
  return salida;
}

// Marca de una palabra clave en la escena (segundos absolutos)
function momento(escena, clave, desde = 0) {
  const p = escena.palabras.find((x) => x.t0 + escena.vozInicio >= desde && norm(x.texto).startsWith(norm(clave)));
  if (!p) throw new Error(`No se encontró «${clave}» en la escena ${escena.id}`);
  return escena.vozInicio + p.t0;
}

function lineaDeTiempo() {
  const guion = leerGuion();
  let t = 0;
  const escenas = guion.escenas.map((e, i) => {
    const wav = join(PUBLICO, "voz", `${e.id}.wav`);
    if (!existsSync(wav)) throw new Error(`Falta la toma de voz ${wav}: ejecuta antes npm run locucion`);
    const vozDuracion = duracion(wav);
    const entrada = i === 0 ? ENTRADA_PRIMERA : ENTRADA;
    const cola = i === guion.escenas.length - 1 ? COLA_FINAL : RESPIRO;
    const inicio = cuadro(t);
    const vozInicio = cuadro(inicio + entrada);
    const fin = cuadro(Math.max(vozInicio + vozDuracion + cola, inicio + MIN_ESCENA));
    t = fin;
    const palabras = palabrasDe(wav);
    const escena = { id: e.id, capitulo: e.capitulo, inicio, fin, vozInicio, vozDuracion, palabras };
    escena.subtitulos = subtitulosDe(e, palabras, vozInicio);
    console.log(
      `${e.id}: ${inicio.toFixed(2)}–${fin.toFixed(2)} s (voz ${vozDuracion.toFixed(2)} s, ${palabras.length} palabras)`,
    );
    return escena;
  });
  return { fps: FPS, total: t, totalCuadros: Math.round(t * FPS), escenas };
}

// Efectos: cada uno está sincronizado con un movimiento concreto en Remotion
function efectos(lt) {
  const e = Object.fromEntries(lt.escenas.map((x) => [x.id.slice(0, 2), x]));
  const lista = [{ tipo: "impacto", t: 0.05, g: 0.5 }];
  for (const [i, x] of lt.escenas.entries()) {
    if (i > 0) lista.push({ tipo: "whoosh", t: x.inicio - 0.22, g: 0.55 });
    if (i < lt.escenas.length - 1) lista.push({ tipo: "pop", t: x.inicio + 0.45, g: 0.5 });
  }
  lista.push({ tipo: "pop", t: momento(e["02"], "claves"), g: 0.45 });
  for (const w of ["plano", "angulo", "camara", "accion", "guion"])
    lista.push({ tipo: "clic", t: momento(e["05"], w), g: 0.6 });
  lista.push({ tipo: "pop", t: momento(e["05"], "tren") /* «trend»: whisper a veces no oye la d final */, g: 0.45 });
  lista.push({ tipo: "campanita", t: momento(e["06"], "confirmacion"), g: 0.4 });
  lista.push({ tipo: "pop", t: momento(e["07"], "mejor"), g: 0.45 });
  for (const w of ["vertical", "cuadrado", "apaisado"]) lista.push({ tipo: "clic", t: momento(e["08"], w), g: 0.6 });
  lista.push({ tipo: "subidon", t: e["11"].inicio - 1.8, g: 0.35 });
  lista.push({ tipo: "impacto", t: e["11"].vozInicio, g: 0.55 });
  return lista.map((x) => ({ ...x, t: cuadro(Math.max(0, x.t)) }));
}

function leerMono(wav) {
  const r = spawnSync("ffmpeg", ["-loglevel", "error", "-i", wav, "-ac", "1", "-ar", String(SR), "-f", "f32le", "-"], {
    maxBuffer: 1 << 30,
  });
  if (r.status !== 0) throw new Error(`No se pudo leer ${wav}`);
  return new Float32Array(r.stdout.buffer.slice(r.stdout.byteOffset, r.stdout.byteOffset + r.stdout.length));
}

function medir(wav, filtroPrevio = "") {
  const r = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-i",
      wav,
      "-af",
      `${filtroPrevio}loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json`,
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8" },
  );
  const m = r.stderr.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/);
  if (!m) throw new Error(`loudnorm no devolvió medidas para ${wav}`);
  return JSON.parse(m[0]);
}

const ff = (args) =>
  execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args], {
    stdio: ["ignore", "inherit", "inherit"],
  });

function mezclar(lt, lista) {
  const voz = estereo(lt.total);
  for (const x of lt.escenas) sumar(voz, leerMono(join(PUBLICO, "voz", `${x.id}.wav`)), x.vozInicio, 0.7, 0);
  escribirWav(join(DIR_AUDIO, "voz.wav"), voz);

  const sfx = estereo(lt.total);
  const fabrica = {
    whoosh: (i) => whoosh(0.55, 7 + i),
    pop: () => pop(760),
    clic: (i) => clic(11 + i),
    campanita: () => campanita(),
    subidon: () => subidon(1.8),
    impacto: (i) => impacto(17 + i),
  };
  lista.forEach((x, i) => {
    // El whoosh se centra en el corte; el resto arranca en su marca
    const s = fabrica[x.tipo](i);
    const desplazamiento = x.tipo === "whoosh" ? -0.1 : 0;
    sumar(sfx, s, x.t + desplazamiento, x.g, x.tipo === "whoosh" ? (i % 2 ? 0.3 : -0.3) : 0);
  });
  escribirWav(join(DIR_AUDIO, "efectos.wav"), sfx);

  const e = Object.fromEntries(lt.escenas.map((x) => [x.id.slice(0, 2), x]));
  escribirWav(
    join(DIR_AUDIO, "musica.wav"),
    componerMusica({
      total: lt.total,
      respiroInicio: e["06"].inicio,
      respiroFin: e["07"].inicio,
      cierre: e["11"].inicio,
    }),
  );

  // Niveles de partida por pista (LUFS integrados), antes de la mezcla
  const gan = (wav, objetivo) => objetivo - Number(medir(wav).input_i);
  const gVoz = gan(join(DIR_AUDIO, "voz.wav"), -17);
  const gMus = gan(join(DIR_AUDIO, "musica.wav"), -27);
  const gSfx = gan(join(DIR_AUDIO, "efectos.wav"), -26);
  const previa = join(DIR_AUDIO, "mezcla-previa.wav");
  ff([
    "-i",
    join(DIR_AUDIO, "voz.wav"),
    "-i",
    join(DIR_AUDIO, "musica.wav"),
    "-i",
    join(DIR_AUDIO, "efectos.wav"),
    "-filter_complex",
    [
      `[0:a]highpass=f=80,acompressor=threshold=0.1:ratio=3:attack=10:release=150,volume=${gVoz.toFixed(2)}dB,asplit=2[v][vsc]`,
      `[1:a]volume=${gMus.toFixed(2)}dB[m]`,
      // Ducking: la música baja bajo la voz y vuelve en las respiraciones
      `[m][vsc]sidechaincompress=threshold=0.015:ratio=6:attack=25:release=450:makeup=1[md]`,
      `[2:a]volume=${gSfx.toFixed(2)}dB[s]`,
      `[v][md][s]amix=inputs=3:normalize=0,alimiter=limit=0.9:level=false[out]`,
    ].join(";"),
    "-map",
    "[out]",
    "-ar",
    String(SR),
    "-ac",
    "2",
    previa,
  ]);

  const m = medir(previa);
  const final = join(PUBLICO, "mezcla.wav");
  ff([
    "-i",
    previa,
    "-af",
    `loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,aresample=${SR}`,
    "-ar",
    String(SR),
    "-ac",
    "2",
    "-c:a",
    "pcm_s16le",
    final,
  ]);
  const comprobacion = medir(final);
  console.log(
    `Mezcla: ${Number(comprobacion.input_i).toFixed(1)} LUFS, pico real ${Number(comprobacion.input_tp).toFixed(1)} dBTP, LRA ${comprobacion.input_lra}`,
  );
  return comprobacion;
}

const srtHora = (s) => {
  const ms = Math.round(s * 1000);
  const p = (n, l = 2) => String(n).padStart(l, "0");
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};

function escribirSrt(lt) {
  const bloques = lt.escenas
    .flatMap((x) => x.subtitulos)
    .map((s, i) => `${i + 1}\n${srtHora(s.inicio)} --> ${srtHora(s.fin)}\n${s.texto}\n`);
  const ruta = join(SALIDA, "escenara-presentacion.srt");
  writeFileSync(ruta, bloques.join("\n"));
  console.log(`Subtítulos: ${ruta} (${bloques.length} bloques)`);
}

// Capítulos de YouTube: el primero en 0:00 y cada uno de al menos 10 s, así que
// se agrupan escenas consecutivas hasta llegar al mínimo.
function escribirCapitulos(lt) {
  const grupos = [];
  for (const e of lt.escenas) {
    const g = grupos.at(-1);
    if (g && g.fin - g.inicio < 10) {
      g.fin = e.fin;
      g.titulos.push(e.capitulo);
    } else grupos.push({ inicio: e.inicio, fin: e.fin, titulos: [e.capitulo] });
  }
  const ult = grupos.at(-1);
  if (grupos.length > 1 && ult.fin - ult.inicio < 10) {
    const pen = grupos.at(-2);
    pen.fin = ult.fin;
    pen.titulos.push(...ult.titulos);
    grupos.pop();
  }
  const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, "0")}`;
  const lineas = grupos.map((g, i) => `${mmss(i === 0 ? 0 : g.inicio)} ${g.titulos.join(" · ")}`);
  writeFileSync(join(SALIDA, "capitulos.txt"), `${lineas.join("\n")}\n`);
  console.log(`Capítulos:\n${lineas.join("\n")}`);
}

function main() {
  const lt = lineaDeTiempo();
  lt.efectos = efectos(lt);
  lt.mezcla = mezclar(lt, lt.efectos);
  writeFileSync(join(PUBLICO, "tiempos.json"), JSON.stringify(lt, null, 2));
  escribirSrt(lt);
  escribirCapitulos(lt);
  const m = Math.floor(lt.total / 60);
  console.log(
    `Duración total: ${m}:${String(Math.round(lt.total % 60)).padStart(2, "0")} (${lt.totalCuadros} cuadros)`,
  );
}

try {
  main();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
