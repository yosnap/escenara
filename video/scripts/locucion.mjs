// Genera la locución con la voz del propietario (perfil «Mi voz» de Voicebox).
// Una toma por frase, varias semillas por frase; cada candidata se transcribe con
// whisper-cli (local) y se elige la que mejor coincide con el texto, sin cortes.
// Solo usa la API local de Voicebox para GENERAR audio nuevo: no lee, copia ni
// exporta muestras del perfil ni su base de datos.
//
// Uso: node scripts/locucion.mjs [--semillas 3] [--semilla-base 11] [--solo 01-gancho,05-direccion] [--rehacer]
// Sin --rehacer reutiliza las tomas brutas ya descargadas y solo vuelve a limpiarlas;
// --reelegir vuelve a limpiar y elegir todas las frases sin generar nada nuevo.
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { corteEstructural, duracion, ejecutar, leerGuion, PUBLICO, SALIDA, similitud } from "./comun.mjs";

const API = process.env.VOICEBOX_URL ?? "http://127.0.0.1:17493";
const PERFIL = process.env.VOICEBOX_PERFIL ?? "89953d28-58ce-4b62-9309-87fb4d9c1d79";
// Modelo gratuito de whisper.cpp; se descarga con `npm run modelo-whisper` a salida/modelos
const WHISPER_MODELO = process.env.WHISPER_MODELO ?? join(SALIDA, "modelos", "ggml-large-v3-turbo-q5_0.bin");

const args = process.argv.slice(2);
const valor = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const SEMILLAS = Number(valor("--semillas", "3"));
const SOLO = valor("--solo", "")?.split(",").filter(Boolean) ?? [];
const REHACER = args.includes("--rehacer");
const REELEGIR = args.includes("--reelegir");
const SEMILLA_BASE = Number(valor("--semilla-base", "11"));

const DIR_CAND = join(SALIDA, "voz", "candidatas");
const DIR_VOZ = join(PUBLICO, "voz");
mkdirSync(DIR_CAND, { recursive: true });
mkdirSync(DIR_VOZ, { recursive: true });

async function pedir(ruta, opciones = {}) {
  const r = await fetch(`${API}${ruta}`, opciones);
  if (!r.ok) throw new Error(`Voicebox ${ruta} respondió ${r.status}: ${await r.text()}`);
  return r;
}

async function comprobarPerfil() {
  const perfiles = await (await pedir("/profiles")).json();
  const p = perfiles.find((x) => x.id === PERFIL);
  if (!p) throw new Error(`No existe el perfil ${PERFIL} en Voicebox`);
  if (p.language !== "es") throw new Error(`El perfil ${p.name} no es de idioma es`);
  return p;
}

async function generar(texto, semilla) {
  const cuerpo = { profile_id: PERFIL, text: texto, language: "es", engine: "qwen", model_size: "1.7B", seed: semilla };
  const g = await (
    await pedir("/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    })
  ).json();
  const limite = Date.now() + 10 * 60_000;
  while (Date.now() < limite) {
    await new Promise((r) => setTimeout(r, 1500));
    const h = await (await pedir(`/history/${g.id}`)).json();
    if (h.status === "completed" && h.duration > 0 && h.audio_path) return g.id;
    if (h.status === "failed" || h.error) throw new Error(`Generación ${g.id} fallida: ${h.error}`);
  }
  throw new Error(`Generación ${g.id} sin terminar tras 10 min`);
}

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
  recortar(bruta, limpia, 0, finVoz);
  let texto = transcribir(limpia);
  let sim = similitud(texto, esperado);
  let recorteInicial = 0;
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

async function main() {
  const perfil = await comprobarPerfil();
  console.log(`Perfil: ${perfil.name} (${perfil.language})`);
  const guion = leerGuion();
  const informePath = join(SALIDA, "voz", "informe.json");
  const informe = existsSync(informePath) ? JSON.parse(readFileSync(informePath, "utf8")) : {};

  for (const escena of guion.escenas) {
    if (SOLO.length && !SOLO.includes(escena.id)) continue;
    const destino = join(DIR_VOZ, `${escena.id}.wav`);
    if (existsSync(destino) && !REHACER && !REELEGIR && !SOLO.length) {
      console.log(`${escena.id}: ya existe, se conserva`);
      continue;
    }
    const candidatas = [];
    for (let i = 0; i < SEMILLAS; i++) {
      const semilla = SEMILLA_BASE + i * 17;
      const bruta = join(DIR_CAND, `${escena.id}-s${semilla}.bruta.wav`);
      const wav = join(DIR_CAND, `${escena.id}-s${semilla}.wav`);
      let generacion = null;
      if (!existsSync(bruta) || REHACER) {
        generacion = await generar(escena.locucion, semilla);
        writeFileSync(bruta, Buffer.from(await (await pedir(`/audio/${generacion}`)).arrayBuffer()));
      }
      const l = limpiarToma(bruta, wav, escena.subtitulo);
      const c = {
        semilla,
        generacion,
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
      candidatas.push(c);
    }
    // Válidas: arranque limpio, final completo, sin silencios largos y con la mejor
    // similitud. Entre ellas, la de duración mediana (ni atropellada ni arrastrada);
    // con dos, la más pausada.
    const puntua = (c) => (c.arranqueLimpio && c.finalCompleto && c.silencios === 0 ? c.similitud : c.similitud - 1);
    const tope = Math.max(...candidatas.map(puntua));
    const validas = candidatas.filter((c) => puntua(c) >= tope - 0.001).sort((a, b) => a.duracion - b.duracion);
    if (tope < 0.95)
      console.warn(
        `AVISO ${escena.id}: ninguna toma supera 0,95 de similitud; conviene más semillas (--semillas 5 --semilla-base 90)`,
      );
    candidatas.splice(
      0,
      candidatas.length,
      validas[Math.floor(validas.length / 2)],
      ...candidatas.filter((c) => !validas.includes(c)),
      ...validas.filter((_, i) => i !== Math.floor(validas.length / 2)),
    );
    const mejor = candidatas[0];
    copyFileSync(mejor.wav, destino);
    informe[escena.id] = { elegida: mejor, candidatas };
    writeFileSync(informePath, JSON.stringify(informe, null, 2));
    console.log(`→ ${escena.id}: elegida s${mejor.semilla} (${mejor.duracion.toFixed(2)} s)`);
  }
  console.log(`Informe: ${informePath}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
