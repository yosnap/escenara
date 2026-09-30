// Síntesis de audio sin dependencias: escritura WAV, osciladores, filtros y
// efectos de sonido. Todo el material sonoro del vídeo sale de aquí (sin
// muestras de terceros), así que no hay derechos que licenciar.
import { writeFileSync } from "node:fs";

export const SR = 48000;

// Generador pseudoaleatorio con semilla: el audio es reproducible byte a byte
export function azar(semilla = 1) {
  let s = semilla >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) / 4294967296) * 2 - 1;
  };
}

export function estereo(segundos) {
  const n = Math.ceil(segundos * SR);
  return [new Float32Array(n), new Float32Array(n)];
}

// Suma una señal mono en una pista estéreo con ganancia y panorama (-1..1)
export function sumar(pista, senal, inicio, ganancia = 1, pan = 0) {
  const o = Math.round(inicio * SR);
  const gl = ganancia * Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = ganancia * Math.sin(((pan + 1) * Math.PI) / 4);
  const [l, r] = pista;
  for (let i = 0; i < senal.length; i++) {
    const k = o + i;
    if (k < 0 || k >= l.length) continue;
    l[k] += senal[i] * gl;
    r[k] += senal[i] * gr;
  }
}

export function escribirWav(ruta, pista) {
  const [l, r] = pista;
  const n = l.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 4, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 4, 40);
  let pico = 0;
  for (let i = 0; i < n; i++) pico = Math.max(pico, Math.abs(l[i]), Math.abs(r[i]));
  // Normaliza a −3 dBFS de pico si hiciera falta; el nivel final lo fija la mezcla
  const g = pico > Math.SQRT1_2 ? Math.SQRT1_2 / pico : 1;
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, l[i] * g)) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, r[i] * g)) * 32767), 46 + i * 4);
  }
  writeFileSync(ruta, buf);
}

export const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

// Filtro de estado variable (Chamberlin); frecuencia puede variar por muestra
export function svf(senal, frecuencia, q = 0.7, tipo = "lp") {
  const out = new Float32Array(senal.length);
  let low = 0;
  let band = 0;
  const damp = 1 / q;
  for (let i = 0; i < senal.length; i++) {
    const fc = typeof frecuencia === "function" ? frecuencia(i / SR) : frecuencia;
    const f = 2 * Math.sin((Math.PI * Math.min(fc, SR / 6)) / SR);
    low += f * band;
    const high = senal[i] - low - damp * band;
    band += f * high;
    out[i] = tipo === "lp" ? low : tipo === "hp" ? high : band;
  }
  return out;
}

function envolvente(n, ataque, caida) {
  const e = new Float32Array(n);
  const a = Math.max(1, Math.round(ataque * SR));
  for (let i = 0; i < n; i++) e[i] = i < a ? i / a : Math.exp(-(i - a) / (caida * SR));
  return e;
}

const ruido = (n, semilla) => {
  const r = azar(semilla);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) s[i] = r();
  return s;
};

// ---------- Instrumentos ----------

export function bombo(duracion = 0.45) {
  const n = Math.round(duracion * SR);
  const s = new Float32Array(n);
  let fase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = 45 + 85 * Math.exp(-t / 0.035);
    fase += (2 * Math.PI * f) / SR;
    s[i] = Math.sin(fase) * Math.exp(-t / 0.16) * (t < 0.002 ? t / 0.002 : 1);
  }
  return s;
}

export function palmada(semilla) {
  const n = Math.round(0.22 * SR);
  const r = svf(ruido(n, semilla), 1600, 1.2, "bp");
  const e = envolvente(n, 0.001, 0.05);
  for (let i = 0; i < n; i++) r[i] *= e[i] * 1.6;
  return r;
}

export function charles(semilla, caida = 0.035) {
  const n = Math.round(0.12 * SR);
  const r = svf(ruido(n, semilla), 7000, 0.8, "hp");
  const e = envolvente(n, 0.0005, caida);
  for (let i = 0; i < n; i++) r[i] *= e[i];
  return r;
}

// Nota con armónicos decrecientes (sierra suave), detune y envolvente ADSR simple
export function nota(
  midi,
  duracion,
  { armonicos = 6, detune = 0.004, ataque = 0.01, liberacion = 0.08, brillo = 1 } = {},
) {
  const n = Math.round((duracion + liberacion) * SR);
  const s = new Float32Array(n);
  const f0 = hz(midi);
  for (const d of detune ? [-detune, detune] : [0]) {
    for (let h = 1; h <= armonicos; h++) {
      const f = f0 * h * (1 + d);
      if (f > SR / 2.5) break;
      const a = (1 / h) ** (1.3 / brillo) * 0.5;
      const w = (2 * Math.PI * f) / SR;
      const ph = h * 1.7 + d * 900;
      for (let i = 0; i < n; i++) s[i] += a * Math.sin(w * i + ph);
    }
  }
  const at = Math.max(1, Math.round(ataque * SR));
  const fin = Math.round(duracion * SR);
  for (let i = 0; i < n; i++) {
    const g = i < at ? i / at : i < fin ? 1 : Math.max(0, 1 - (i - fin) / (liberacion * SR));
    s[i] *= g;
  }
  return s;
}

export function pulso(midi, semilla = 3) {
  // Pluck: seno + segundo armónico con caída rápida
  const n = Math.round(0.5 * SR);
  const s = new Float32Array(n);
  const f = hz(midi);
  const r = azar(semilla);
  const ph = r() * Math.PI;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    s[i] =
      (Math.sin(2 * Math.PI * f * t + ph) + 0.35 * Math.sin(4 * Math.PI * f * t)) *
      Math.exp(-t / 0.12) *
      Math.min(1, t / 0.002);
  }
  return s;
}

// ---------- Efectos de interfaz ----------

export function whoosh(duracion = 0.6, semilla = 7, subida = true) {
  const n = Math.round(duracion * SR);
  const f = (t) => {
    const x = t / duracion;
    return subida ? 300 + 5200 * x * x : 5500 - 5200 * x;
  };
  const s = svf(ruido(n, semilla), f, 2.2, "bp");
  for (let i = 0; i < n; i++) {
    const x = i / n;
    s[i] *= Math.sin(Math.PI * x) ** 1.5 * 1.8;
  }
  return s;
}

export function pop(frecuencia = 720) {
  const n = Math.round(0.09 * SR);
  const s = new Float32Array(n);
  let fase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    fase += (2 * Math.PI * frecuencia * (1 - 0.45 * Math.min(1, t / 0.05))) / SR;
    s[i] = Math.sin(fase) * Math.exp(-t / 0.022) * Math.min(1, t / 0.0015);
  }
  return s;
}

export function clic(semilla = 11) {
  const n = Math.round(0.02 * SR);
  const s = svf(ruido(n, semilla), 3500, 3, "bp");
  for (let i = 0; i < n; i++) s[i] *= Math.exp(-i / (0.003 * SR)) * 2.5;
  return s;
}

export function campanita(base = 76) {
  // Dos notas limpias (confirmación suave)
  const a = nota(base, 0.12, { armonicos: 2, detune: 0, ataque: 0.003, liberacion: 0.5 });
  const b = nota(base + 7, 0.25, { armonicos: 2, detune: 0, ataque: 0.003, liberacion: 0.7 });
  const n = Math.round(0.11 * SR) + b.length;
  const s = new Float32Array(n);
  for (let i = 0; i < a.length; i++) s[i] += a[i] * Math.exp(-i / (0.25 * SR));
  const o = Math.round(0.11 * SR);
  for (let i = 0; i < b.length; i++) s[o + i] += b[i] * Math.exp(-i / (0.35 * SR));
  return s;
}

export function subidon(duracion = 2, semilla = 13) {
  const n = Math.round(duracion * SR);
  const s = svf(ruido(n, semilla), (t) => 400 + 6000 * (t / duracion) ** 2, 1.5, "bp");
  let fase = 0;
  for (let i = 0; i < n; i++) {
    const x = i / n;
    fase += (2 * Math.PI * (220 + 660 * x * x)) / SR;
    s[i] = (s[i] * 0.9 + Math.sin(fase) * 0.25) * x ** 2.2;
  }
  return s;
}

export function impacto(semilla = 17) {
  const n = Math.round(1.8 * SR);
  const s = new Float32Array(n);
  let fase = 0;
  const r = svf(ruido(n, semilla), 900, 0.7, "lp");
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    fase += (2 * Math.PI * (38 + 50 * Math.exp(-t / 0.08))) / SR;
    s[i] = Math.sin(fase) * Math.exp(-t / 0.5) + r[i] * Math.exp(-t / 0.25) * 0.5;
  }
  return s;
}
