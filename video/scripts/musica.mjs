// Cama musical original, sintetizada: moderna y sobria, 104 BPM en La menor
// (Am – F – C – G). Se adapta a la duración real del vídeo y a sus momentos:
// entrada suave, ritmo completo, respiro en la escena de costes y cierre sobre
// el logotipo con un acorde que se deja sonar.
import { bombo, charles, estereo, nota, palmada, pulso, SR, sumar } from "./sintesis.mjs";

const BPM = 104;
const PULSO = 60 / BPM;
const COMPAS = PULSO * 4;
const ACORDES = [
  { pad: [57, 60, 64], bajo: 45, arpegio: [69, 72, 76, 72] }, // Am
  { pad: [53, 57, 60], bajo: 41, arpegio: [65, 69, 72, 69] }, // F
  { pad: [55, 60, 64], bajo: 48, arpegio: [67, 72, 76, 72] }, // C
  { pad: [55, 59, 62], bajo: 43, arpegio: [67, 71, 74, 71] }, // G
];

const aPulso = (t) => Math.round(t / PULSO) * PULSO;

/**
 * @param {{ total: number, respiroInicio: number, respiroFin: number, cierre: number }} p
 * Segundos del vídeo. Devuelve una pista estéreo [L, R].
 */
export function componerMusica(p) {
  const pista = estereo(p.total);
  const respiroIni = aPulso(p.respiroInicio);
  const respiroFin = aPulso(p.respiroFin);
  const cierre = aPulso(p.cierre);
  const ritmoIni = COMPAS; // tras un compás de entrada
  const k = bombo();
  const compases = Math.ceil(p.total / COMPAS);

  for (let c = 0; c < compases; c++) {
    const t0 = c * COMPAS;
    if (t0 >= p.total) break;
    const acorde = ACORDES[c % 4];
    const enCierre = t0 >= cierre;
    const enRespiro = t0 + COMPAS > respiroIni && t0 < respiroFin;

    // Pad: acorde sostenido todo el compás (en el cierre, solo el primero y largo)
    if (!enCierre || t0 < cierre + COMPAS) {
      const acordeCierre = enCierre ? ACORDES[0] : acorde;
      const dur = enCierre ? Math.max(COMPAS, p.total - t0 - 0.3) : COMPAS;
      for (const [i, m] of acordeCierre.pad.entries()) {
        const s = nota(m, dur, { armonicos: 5, detune: 0.005, ataque: 0.35, liberacion: 0.6, brillo: 0.8 });
        sumar(pista, s, t0, enCierre ? 0.075 : 0.055, (i - 1) * 0.5);
      }
      if (enCierre) {
        const b = nota(33, dur, { armonicos: 3, detune: 0, ataque: 0.05, liberacion: 1.2 });
        sumar(pista, b, t0, 0.12, 0);
      }
    }
    if (enCierre) continue;

    for (let b = 0; b < 4; b++) {
      const tb = t0 + b * PULSO;
      if (tb >= cierre) break;
      const ritmo = tb >= ritmoIni && !(tb >= respiroIni && tb < respiroFin);
      // Subida progresiva del ritmo tras el respiro (dos compases)
      const vuelta =
        tb >= respiroFin && tb < respiroFin + 2 * COMPAS ? 0.6 + (0.4 * (tb - respiroFin)) / (2 * COMPAS) : 1;
      if (ritmo) {
        sumar(pista, k, tb, 0.42 * vuelta, 0);
        if (b === 1 || b === 3) sumar(pista, palmada(c * 4 + b), tb, 0.16 * vuelta, 0.05);
      }
      // Charles en corcheas: también en el respiro, más suave, para no perder el pulso
      for (const sub of [0, 0.5]) {
        const th = tb + sub * PULSO;
        const g = ritmo ? (sub ? 0.07 : 0.04) : enRespiro ? 0.03 : 0;
        if (g && th >= ritmoIni * 0.5)
          sumar(pista, charles(c * 8 + b * 2 + (sub ? 1 : 0), sub ? 0.05 : 0.03), th, g * vuelta, 0.3);
      }
      // Bajo en corcheas con bombeo (el sidechain «de estilo» va integrado)
      if (ritmo) {
        for (const sub of [0, 0.5]) {
          const s = nota(acorde.bajo, PULSO * 0.42, {
            armonicos: 4,
            detune: 0.002,
            ataque: 0.008,
            liberacion: 0.05,
            brillo: 0.7,
          });
          sumar(pista, s, tb + sub * PULSO, sub ? 0.16 : 0.1, 0);
        }
      }
      // Arpegio en semicorcheas, discreto; en el respiro queda solo él (a medio tiempo)
      const pasos = enRespiro && !ritmo ? [0] : [0, 0.25, 0.5, 0.75];
      for (const [j, sub] of pasos.entries()) {
        const m = acorde.arpegio[(b * pasos.length + j) % 4];
        sumar(pista, pulso(m, c * 16 + b * 4 + j), tb + sub * PULSO, ritmo ? 0.045 : 0.06, j % 2 ? 0.35 : -0.35);
      }
    }
  }

  // Fundido de salida en los últimos 1,5 s
  const [l, r] = pista;
  const fin = l.length;
  const fundido = Math.round(1.5 * SR);
  for (let i = fin - fundido; i < fin; i++) {
    const g = (fin - i) / fundido;
    l[i] *= g;
    r[i] *= g;
  }
  return pista;
}
