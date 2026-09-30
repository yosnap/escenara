// Troceo del texto del guion en subtítulos: bloques de hasta dos líneas de
// 42 caracteres, cortando por oraciones, comas o el punto más equilibrado.
export const MAX_LINEA = 42;

// Parte una línea larga en dos, lo más equilibradas posible, sin pasar de 42
export function equilibrar(palabras) {
  const texto = palabras.join(" ");
  if (texto.length <= MAX_LINEA) return texto;
  let mejor = null;
  for (let i = 1; i < palabras.length; i++) {
    const a = palabras.slice(0, i).join(" ");
    const b = palabras.slice(i).join(" ");
    const coste = Math.max(a.length, b.length) + (/[.,:;]$/.test(palabras[i - 1]) ? -12 : 0);
    if (a.length <= MAX_LINEA && b.length <= MAX_LINEA && (!mejor || coste < mejor.coste))
      mejor = { coste, t: `${a}\n${b}` };
  }
  if (!mejor) throw new Error(`No cabe en dos líneas de ${MAX_LINEA}: «${texto}»`);
  return mejor.t;
}

// Bloques de hasta dos líneas: una oración por bloque; si no cabe, se corta en comas
// y, como último recurso, por palabras.
export function trocear(texto) {
  const oraciones = texto
    .match(/[^.:?!]+[.:?!]*/g)
    .map((x) => x.trim())
    .filter(Boolean);
  const bloques = [];
  for (const o of oraciones) {
    if (o.length <= 2 * MAX_LINEA) {
      bloques.push(o.split(/\s+/));
      continue;
    }
    let actual = [];
    for (const clausula of o.split(/(?<=,)\s+/)) {
      const w = clausula.split(/\s+/);
      if (actual.length && [...actual, ...w].join(" ").length > 2 * MAX_LINEA) {
        bloques.push(actual);
        actual = [];
      }
      actual.push(...w);
      while (actual.join(" ").length > 2 * MAX_LINEA) {
        let k = actual.length;
        while (actual.slice(0, k).join(" ").length > 2 * MAX_LINEA) k--;
        bloques.push(actual.slice(0, k));
        actual = actual.slice(k);
      }
    }
    if (actual.length) bloques.push(actual);
  }
  // Un bloque muy corto (p. ej. «Escenara.») se une al siguiente si caben juntos
  const partidos = bloques.flatMap(partirSiNoCabe);
  for (let i = 0; i < partidos.length - 1; i++) {
    if (partidos[i].join(" ").length < 12 && cabe([...partidos[i], ...partidos[i + 1]]))
      partidos.splice(i, 2, [...partidos[i], ...partidos[i + 1]]);
  }
  return partidos;
}

const cabe = (w) => {
  try {
    equilibrar(w);
    return true;
  } catch {
    return false;
  }
};

// Si un bloque no cabe en dos líneas, se divide en dos bloques seguidos por el
// punto más equilibrado (mejor tras coma o antes de «y»/«o»)
function partirSiNoCabe(w) {
  if (cabe(w)) return [w];
  let mejor = null;
  for (let i = 1; i < w.length; i++) {
    const a = w.slice(0, i);
    const b = w.slice(i);
    if (!cabe(a) || !cabe(b)) continue;
    const coste =
      Math.abs(a.join(" ").length - b.join(" ").length) - (/,$/.test(w[i - 1]) || /^(y|o)$/.test(w[i]) ? 30 : 0);
    if (!mejor || coste < mejor.coste) mejor = { coste, i };
  }
  if (!mejor) throw new Error(`No se puede partir el subtítulo «${w.join(" ")}»`);
  return [w.slice(0, mejor.i), w.slice(mejor.i)];
}
