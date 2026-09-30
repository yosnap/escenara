// Genera la locución: una toma por frase con el motor elegido, transcrita con
// whisper-cli (local) y validada contra el guion (arranque, final, silencios).
//
// Motores (scripts/motores-voz.mjs):
//  - elevenlabs (por defecto): UNA toma por frase; solo se repite si whisper
//    detecta un error, como mucho 2 veces por frase, y nunca por encima del tope
//    de caracteres (--tope, 3000 por defecto; registro en salida/voz/elevenlabs/gasto.json).
//    Requiere la variable de entorno ELEVENLABS_API_KEY.
//  - voicebox: varias semillas por frase y se queda la de duración mediana.
//
// Uso: node scripts/locucion.mjs [--motor elevenlabs|voicebox] [--solo 01-gancho,05-direccion]
//        [--semillas 3] [--semilla-base 11] [--reintentos 2] [--tope 3000] [--rehacer] [--reelegir]
// Las tomas brutas ya descargadas se reutilizan (no se vuelve a pagar); --rehacer
// las regenera; --reelegir vuelve a limpiar y elegir sin generar nada.
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { corteEstructural, duracion, ejecutar, leerGuion, PUBLICO, SALIDA, similitud } from "./comun.mjs";
import { motorElevenLabs, motorVoicebox, registroGasto } from "./motores-voz.mjs";

// Modelo gratuito de whisper.cpp; se descarga con `npm run modelo-whisper` a salida/modelos
const WHISPER_MODELO = process.env.WHISPER_MODELO ?? join(SALIDA, "modelos", "ggml-large-v3-turbo-q5_0.bin");

const args = process.argv.slice(2);
const valor = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const MOTOR = valor("--motor", "elevenlabs");
const SOLO = valor("--solo", "")?.split(",").filter(Boolean) ?? [];
const REHACER = args.includes("--rehacer");
const REELEGIR = args.includes("--reelegir");
const SEMILLA_BASE = Number(valor("--semilla-base", "11"));
const SEMILLAS = Number(valor("--semillas", MOTOR === "voicebox" ? "3" : "1"));
const REINTENTOS = Number(valor("--reintentos", MOTOR === "voicebox" ? "0" : "2"));
const TOPE = Number(valor("--tope", "3000"));
if (!["elevenlabs", "voicebox"].includes(MOTOR)) throw new Error(`Motor desconocido: ${MOTOR}`);

// Las tomas de Voicebox conservan su carpeta histórica (salida/voz/candidatas)
const DIR_MOTOR = join(SALIDA, "voz", MOTOR === "voicebox" ? "." : MOTOR);
const DIR_CAND = join(SALIDA, "voz", MOTOR === "voicebox" ? "candidatas" : join(MOTOR, "candidatas"));
const DIR_VOZ = join(PUBLICO, "voz");
mkdirSync(DIR_CAND, { recursive: true });
mkdirSync(DIR_VOZ, { recursive: true });

function transcribir(wav) {
  // whisper-cli espera 16 kHz mono
  const tmp = `${wav}.16k.wav`;
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-i",
    wav,
    "-af",
    "adelay=300,apad=pad_dur=2",
    "-ar",
    "16000",
    "-ac",
    "1",
    tmp,
  ]);
  const out = execFileSync("whisper-cli", ["-m", WHISPER_MODELO, "-l", "es", "-nt", "-np", "-f", tmp], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  rmSync(tmp, { force: true });
  return out.replace(/\s+/g, " ").trim();
}

function silencios(wav, umbral, minimo) {
  const r = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-i", wav, "-af", `silencedetect=n=${umbral}dB:d=${minimo}`, "-f", "null", "-"],
    { encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(`ffmpeg silencedetect falló en ${wav}`);
  const ini = [...r.stderr.matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1]));
  const fin = [...r.stderr.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  return ini.map((s, i) => ({ inicio: s, fin: fin[i] ?? Number.POSITIVE_INFINITY }));
}

// Silencios internos > 0,9 s delatan cortes o bloqueos del modelo
function contarSilencios(wav) {
  const total = duracion(wav);
  return silencios(wav, -40, 0.9).filter((s) => s.inicio > 0.3 && s.fin < total - 0.2).length;
}

const primeraPalabra = (t) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .match(/[a-z0-9]+/)?.[0] ?? "";

function recortar(entrada, salida, desde, hasta) {
  const d = hasta - desde;
  ejecutar("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-ss",
    desde.toFixed(3),
    "-t",
    d.toFixed(3),
    "-i",
    entrada,
    "-af",
    `afade=t=in:d=0.02,afade=t=out:st=${(d - 0.04).toFixed(3)}:d=0.04`,
    "-ar",
    "48000",
    "-ac",
    "1",
    salida,
  ]);
}

// Energía (dBFS) por ventanas de 20 ms, para cortar en el punto más silencioso
function envolvente(wav) {
  const r = spawnSync("ffmpeg", ["-loglevel", "error", "-i", wav, "-ac", "1", "-ar", "8000", "-f", "s16le", "-"], {
    maxBuffer: 1 << 28,
  });
  if (r.status !== 0) throw new Error(`ffmpeg no pudo leer ${wav}`);
  const m = new Int16Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length / 2);
  const w = 160;
  const e = [];
  for (let i = 0; i + w <= m.length; i += w) {
    let acc = 0;
    for (let j = i; j < i + w; j++) acc += m[j] * m[j];
    e.push(20 * Math.log10(Math.max(1, Math.sqrt(acc / w)) / 32768));
  }
  return e; // índice k → k * 0,02 s
}

const ultimaPalabra = (t) =>
  primeraPalabra(
    [
      ...t
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .matchAll(/[a-z0-9]+/g),
    ].pop()?.[0] ?? "",
  );

// El clon arrastra a veces una sílaba de la muestra de referencia al inicio
// (whisper la oye como «Adiós,»). Se busca el corte más temprano que deja como
// primera palabra la del guion, se ajusta al mínimo de energía cercano y solo se
// acepta si la similitud no empeora. También se recorta el silencio final a 0,12 s.
function limpiarToma(bruta, limpia, esperado) {
  const total = duracion(bruta);
  const cola = silencios(bruta, -45, 0.1).find((s) => s.fin >= total - 0.01);
  const finVoz = cola ? Math.min(total, cola.inicio + 0.12) : total;
  // Silencio inicial recortado a 0,05 s (la entrada de cada escena la marca audio.mjs)
  const cabeza = silencios(bruta, -45, 0.05).find((s) => s.inicio < 0.01);
  const inicioVoz = cabeza && Number.isFinite(cabeza.fin) ? Math.max(0, cabeza.fin - 0.05) : 0;
  recortar(bruta, limpia, inicioVoz, finVoz);
  let texto = transcribir(limpia);
  let sim = similitud(texto, esperado);
  let recorteInicial = inicioVoz;
  if (primeraPalabra(texto) !== primeraPalabra(esperado)) {
    const desde = corteEstructural(envolvente(bruta));
    if (desde !== null) {
      const prueba = `${limpia}.prueba.wav`;
      // Se verifica sin recortar la cola: whisper base pierde el último segmento en audios secos
      recortar(bruta, prueba, desde, total);
      const t2 = transcribir(prueba);
      if (process.env.DEPURAR) console.log(`  corte ${desde.toFixed(2)} s → «${t2}»`);
      const s2 = similitud(t2, esperado);
      if (primeraPalabra(t2) === primeraPalabra(esperado) && s2 >= sim - 0.02) {
        recortar(bruta, limpia, desde, finVoz);
        texto = t2;
        sim = s2;
        recorteInicial = desde;
      }
      rmSync(prueba, { force: true });
    }
  }
  return {
    texto,
    sim,
    recorteInicial,
    arranqueLimpio: primeraPalabra(texto) === primeraPalabra(esperado),
    finalCompleto: ultimaPalabra(texto) === ultimaPalabra(esperado),
  };
}

const valida = (c) => c.arranqueLimpio && c.finalCompleto && c.silencios === 0 && c.similitud >= 0.95;

async function tomar(motor, escena, semilla) {
  const base = join(DIR_CAND, `${escena.id}-s${semilla}`);
  const wav = `${base}.wav`;
  const existente = ["mp3", "wav"].map((x) => `${base}.bruta.${x}`).find((f) => existsSync(f));
  let bruta = existente;
  if (!bruta || REHACER) {
    if (REELEGIR) throw new Error(`--reelegir sin toma bruta para ${escena.id} s${semilla}`);
    const { audio, extension } = await motor.generar(escena.locucion, semilla, escena.id);
    bruta = `${base}.bruta.${extension}`;
    writeFileSync(bruta, audio);
  }
  const l = limpiarToma(bruta, wav, escena.subtitulo);
  const c = {
    semilla,
    wav,
    duracion: duracion(wav),
    transcripcion: l.texto,
    similitud: l.sim,
    recorteInicial: l.recorteInicial,
    arranqueLimpio: l.arranqueLimpio,
    finalCompleto: l.finalCompleto,
    silencios: contarSilencios(wav),
  };
  console.log(
    `${escena.id} s${semilla}: ${c.duracion.toFixed(2)} s, sim ${c.similitud.toFixed(3)}, recorte ${c.recorteInicial.toFixed(2)} s, silencios ${c.silencios} → «${l.texto}»`,
  );
  return c;
}

async function main() {
  const gasto = registroGasto(join(SALIDA, "voz", "elevenlabs", "gasto.json"), TOPE);
  const motor = MOTOR === "voicebox" ? motorVoicebox() : motorElevenLabs({ gasto });
  if (!REELEGIR) await motor.preparar();
  console.log(`Motor: ${motor.nombre}`);
  const guion = leerGuion();
  const informePath = join(DIR_MOTOR, "informe.json");
  const informe = existsSync(informePath) ? JSON.parse(readFileSync(informePath, "utf8")) : {};

  for (const escena of guion.escenas) {
    if (SOLO.length && !SOLO.includes(escena.id)) continue;
    const destino = join(DIR_VOZ, `${escena.id}.wav`);
    if (existsSync(destino) && informe[escena.id] && !REHACER && !REELEGIR && !SOLO.length) {
      console.log(`${escena.id}: ya existe, se conserva`);
      continue;
    }
    const candidatas = [];
    for (let i = 0; i < SEMILLAS; i++) candidatas.push(await tomar(motor, escena, SEMILLA_BASE + i * 17));
    // Repeticiones solo si ninguna toma es válida (whisper detectó un error)
    for (let r = 1; r <= REINTENTOS && !candidatas.some(valida); r++) {
      console.log(`${escena.id}: toma con error, repetición ${r} de ${REINTENTOS}`);
      candidatas.push(await tomar(motor, escena, SEMILLA_BASE + (SEMILLAS + r - 1) * 17));
    }
    // Válidas: arranque limpio, final completo, sin silencios largos y con la mejor
    // similitud. Entre ellas, la de duración mediana (ni atropellada ni arrastrada).
    const puntua = (c) => (c.arranqueLimpio && c.finalCompleto && c.silencios === 0 ? c.similitud : c.similitud - 1);
    const tope = Math.max(...candidatas.map(puntua));
    const validas = candidatas.filter((c) => puntua(c) >= tope - 0.001).sort((a, b) => a.duracion - b.duracion);
    if (tope < 0.95) console.warn(`AVISO ${escena.id}: ninguna toma supera 0,95 de similitud; revísala a oído`);
    const mejor = validas[Math.floor(validas.length / 2)];
    copyFileSync(mejor.wav, destino);
    informe[escena.id] = { elegida: mejor, candidatas };
    writeFileSync(informePath, JSON.stringify(informe, null, 2));
    console.log(`→ ${escena.id}: elegida s${mejor.semilla} (${mejor.duracion.toFixed(2)} s)`);
  }
  if (motor.nombre === "elevenlabs")
    console.log(`Caracteres de ElevenLabs gastados en total: ${gasto.total()} de ${TOPE}`);
  console.log(`Informe: ${informePath}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
