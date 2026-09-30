// Motores de síntesis de voz para la locución. Cada motor expone:
//   preparar(): comprueba requisitos antes de gastar nada
//   generar(texto, semilla): devuelve { audio: Buffer, extension }
//
// - elevenlabs (por defecto): voz de la biblioteca compartida de ElevenLabs.
//   La clave se lee SOLO de la variable de entorno ELEVENLABS_API_KEY; nunca se
//   imprime ni se escribe. Cada petición se apunta en un registro de gasto y se
//   rechaza si superaría el tope de caracteres.
// - voicebox: API local de la app Voicebox (perfil de voz clonada del autor).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const ELEVENLABS = {
  url: "https://api.elevenlabs.io/v1/text-to-speech",
  // «Martin Osborne - Polished and Energetic», biblioteca compartida, acento peninsular
  voz: process.env.ELEVENLABS_VOZ ?? "D7dkYvH17OKLgp4SLulf",
  modelo: "eleven_multilingual_v2",
  idioma: "es",
  ajustes: { stability: 0.5, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true },
  formato: "mp3_44100_128",
};

/** Registro persistente de caracteres gastados (evita pasarse del presupuesto entre ejecuciones). */
export function registroGasto(ruta, tope) {
  const leer = () => (existsSync(ruta) ? JSON.parse(readFileSync(ruta, "utf8")) : { caracteres: 0, peticiones: [] });
  return {
    total: () => leer().caracteres,
    comprobar(n) {
      const actual = leer().caracteres;
      if (actual + n > tope) {
        throw new Error(`Presupuesto agotado: ${actual} + ${n} caracteres superaría el tope de ${tope}`);
      }
    },
    apuntar(entrada) {
      const r = leer();
      r.caracteres += entrada.caracteres;
      r.peticiones.push({ ...entrada, fecha: new Date().toISOString() });
      mkdirSync(dirname(ruta), { recursive: true });
      writeFileSync(ruta, JSON.stringify(r, null, 2));
    },
  };
}

export function motorElevenLabs({ gasto }) {
  const clave = () => {
    const k = process.env.ELEVENLABS_API_KEY?.trim();
    if (!k) throw new Error("Falta la variable de entorno ELEVENLABS_API_KEY (ver video/README.md)");
    return k;
  };
  return {
    nombre: "elevenlabs",
    preparar() {
      clave();
    },
    async generar(texto, semilla, etiqueta) {
      gasto.comprobar(texto.length);
      const url = `${ELEVENLABS.url}/${ELEVENLABS.voz}?output_format=${ELEVENLABS.formato}`;
      const r = await fetch(url, {
        method: "POST",
        headers: { "xi-api-key": clave(), "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify({
          text: texto,
          model_id: ELEVENLABS.modelo,
          language_code: ELEVENLABS.idioma,
          voice_settings: ELEVENLABS.ajustes,
          seed: semilla,
        }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!r.ok) {
        // El cuerpo del error de ElevenLabs no contiene la clave; se recorta por si acaso
        throw new Error(`ElevenLabs respondió ${r.status}: ${(await r.text()).slice(0, 400)}`);
      }
      const audio = Buffer.from(await r.arrayBuffer());
      if (audio.length < 1000) throw new Error(`ElevenLabs devolvió un audio vacío para ${etiqueta}`);
      const cobrados = Number(r.headers.get("x-character-count")) || texto.length;
      gasto.apuntar({ escena: etiqueta, semilla, caracteres: cobrados, id: r.headers.get("request-id") ?? null });
      return { audio, extension: "mp3" };
    },
  };
}

export function motorVoicebox() {
  const API = process.env.VOICEBOX_URL ?? "http://127.0.0.1:17493";
  const PERFIL = process.env.VOICEBOX_PERFIL ?? "89953d28-58ce-4b62-9309-87fb4d9c1d79";
  const pedir = async (ruta, opciones = {}) => {
    const r = await fetch(`${API}${ruta}`, opciones);
    if (!r.ok) throw new Error(`Voicebox ${ruta} respondió ${r.status}: ${await r.text()}`);
    return r;
  };
  return {
    nombre: "voicebox",
    async preparar() {
      const perfiles = await (await pedir("/profiles")).json();
      const p = perfiles.find((x) => x.id === PERFIL);
      if (!p) throw new Error(`No existe el perfil ${PERFIL} en Voicebox`);
      if (p.language !== "es") throw new Error(`El perfil ${p.name} no es de idioma es`);
    },
    async generar(texto, semilla) {
      const cuerpo = {
        profile_id: PERFIL,
        text: texto,
        language: "es",
        engine: "qwen",
        model_size: "1.7B",
        seed: semilla,
      };
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
        if (h.status === "completed" && h.duration > 0 && h.audio_path) {
          return { audio: Buffer.from(await (await pedir(`/audio/${g.id}`)).arrayBuffer()), extension: "wav" };
        }
        if (h.status === "failed" || h.error) throw new Error(`Generación ${g.id} fallida: ${h.error}`);
      }
      throw new Error(`Generación ${g.id} sin terminar tras 10 min`);
    },
  };
}
