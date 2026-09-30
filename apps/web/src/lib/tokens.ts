import { COLOR_HEX, motivoFamiliaNoValida, motivoNombreFuenteNoValido } from "./marca-esquema";

/**
 * Genera las variables CSS de la interfaz a partir de docs/branding/escenara.brand.json y, desde la 0.42.0, a partir
 * de la marca publicada de la instalación. Antes de escribir nada comprueba **cada valor** con las mismas listas
 * estrictas del esquema: aunque llegue una marca sin pasar por el validador, no sale CSS con nada que no sea un color,
 * una familia admitida o un número.
 */
export type Tema = Record<string, string>;

export interface Marca {
  brandVersion: string;
  theme: { light: Tema; dark: Tema };
  vibrant: { light: Tema; dark: Tema };
  gradients: Record<string, string[]>;
  typography: { family: string; mono: string };
  layout: { controlRadiusPx: number; cardRadiusPx: number };
  motion: { interactionMs: [number, number]; transitionMs: [number, number]; themeMs: number };
}

const kebab = (nombre: string) => nombre.replace(/[A-Z]/g, (l) => `-${l.toLowerCase()}`);

function variables(tema: Tema, vibrante: Tema, gradientes: Marca["gradients"]): string[] {
  const lineas = Object.entries(tema).map(([k, v]) => `  --${kebab(k)}: ${v};`);
  lineas.push(...Object.entries(vibrante).map(([k, v]) => `  --vibrant-${kebab(k)}: ${v};`));
  for (const [nombre, paradas] of Object.entries(gradientes)) {
    const colores = paradas.map((p) => `var(--vibrant-${kebab(p)})`).join(", ");
    lineas.push(`  --gradient-${nombre}: linear-gradient(135deg, ${colores});`);
  }
  return lineas;
}

/** Fuente propia de la instalación: su familia y la URL de nuestro servidor de donde se carga. */
export interface FuenteCss {
  familia: string;
  url: string;
}

export interface OpcionesCss {
  /**
   * CSS de la **marca publicada** de la instalación, que se sirve en el HTML después de `tokens.css`. Sus selectores
   * llevan `:root:root` para ganar por especificidad a los de `tokens.css` sea cual sea el orden en el que el navegador
   * los lea, y fija además la familia principal (la de `next/font`, que va delante en `--font-sans`).
   */
  instalacion?: { version: number; fuentes: FuenteCss[] };
}

const CLAVE_TOKEN = /^[a-z][A-Za-z0-9]*$/;
const NOMBRE_DEGRADADO = /^[a-z][a-z0-9]*$/;
const VERSION = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const URL_FUENTE = /^\/api\/marca\/activos\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Lanza si algún valor que va a acabar en el CSS no tiene exactamente la forma esperada. */
export function exigirMarcaSegura(marca: Marca, fuentes: readonly FuenteCss[] = []): void {
  const fallo = (que: string) => {
    throw new Error(`La marca no se puede convertir en CSS: ${que}.`);
  };
  if (!VERSION.test(marca.brandVersion)) fallo("versión de marca no válida");
  const vibrantes = new Set(Object.keys(marca.vibrant.light));
  for (const grupo of [marca.theme.light, marca.theme.dark, marca.vibrant.light, marca.vibrant.dark]) {
    for (const [clave, valor] of Object.entries(grupo)) {
      if (!CLAVE_TOKEN.test(clave)) fallo(`nombre de token no válido (${clave.slice(0, 40)})`);
      if (!COLOR_HEX.test(valor)) fallo(`el token ${clave} no es un color #RRGGBB`);
    }
  }
  for (const [nombre, paradas] of Object.entries(marca.gradients)) {
    if (!NOMBRE_DEGRADADO.test(nombre)) fallo(`nombre de degradado no válido (${nombre.slice(0, 40)})`);
    if (!paradas.every((p) => vibrantes.has(p))) fallo(`el degradado ${nombre} usa un color que no existe`);
  }
  if (motivoFamiliaNoValida(marca.typography.family)) fallo("familia tipográfica no admitida");
  if (motivoFamiliaNoValida(marca.typography.mono)) fallo("familia monoespaciada no admitida");
  const numeros = [
    marca.layout.controlRadiusPx,
    marca.layout.cardRadiusPx,
    ...marca.motion.interactionMs,
    ...marca.motion.transitionMs,
    marca.motion.themeMs,
  ];
  if (!numeros.every((n) => Number.isInteger(n) && n >= 0 && n <= 5000)) fallo("hay una medida que no es un entero");
  for (const f of fuentes) {
    if (motivoNombreFuenteNoValido(f.familia)) fallo("nombre de fuente propia no admitido");
    if (!URL_FUENTE.test(f.url)) fallo("URL de fuente propia no admitida");
  }
}

export function generarCss(marca: Marca, opciones: OpcionesCss = {}): string {
  const instalacion = opciones.instalacion;
  exigirMarcaSegura(marca, instalacion?.fuentes);
  if (instalacion && !(Number.isInteger(instalacion.version) && instalacion.version > 0)) {
    throw new Error("La marca no se puede convertir en CSS: número de versión no válido.");
  }
  const raiz = instalacion ? ":root:root" : ":root";
  const claro = variables(marca.theme.light, marca.vibrant.light, marca.gradients);
  const oscuro = variables(marca.theme.dark, marca.vibrant.dark, marca.gradients);
  const comunes = [
    `  --font-family: ${marca.typography.family};`,
    `  --font-mono-family: ${marca.typography.mono};`,
    `  --radius-control: ${marca.layout.controlRadiusPx}px;`,
    `  --radius-card: ${marca.layout.cardRadiusPx}px;`,
    `  --motion-fast: ${marca.motion.interactionMs[0]}ms;`,
    `  --motion-base: ${marca.motion.interactionMs[1]}ms;`,
    `  --motion-slow: ${marca.motion.transitionMs[1]}ms;`,
    `  --motion-theme: ${marca.motion.themeMs}ms;`,
    // La familia de `next/font` va delante en `--font-sans`: la marca de la instalación la sustituye por la suya.
    ...(instalacion ? [`  --font-manrope: ${marca.typography.family};`] : []),
  ];
  const cabecera = instalacion
    ? [
        `/* Marca publicada de la instalación (versión ${instalacion.version}, marca ${marca.brandVersion}). */`,
        ...instalacion.fuentes.map(
          (f) =>
            `@font-face { font-family: "${f.familia}"; src: url("${f.url}") format("woff2"); font-weight: 100 900; font-display: swap; }`,
        ),
      ]
    : [
        `/* Generado desde docs/branding/escenara.brand.json (marca ${marca.brandVersion}). No editar a mano: bun run tokens */`,
      ];
  return [
    ...cabecera,
    `${raiz} {`,
    "  color-scheme: light;",
    ...comunes,
    ...claro,
    "}",
    "",
    "@media (prefers-color-scheme: dark) {",
    `  ${raiz}:not([data-theme="light"]) {`,
    "    color-scheme: dark;",
    ...oscuro.map((l) => `  ${l}`),
    "  }",
    "}",
    "",
    `${raiz}[data-theme="dark"] {`,
    "  color-scheme: dark;",
    ...oscuro,
    "}",
    "",
  ].join("\n");
}

/** Contraste WCAG 2.x entre dos colores hexadecimales (#RRGGBB). */
export function contraste(a: string, b: string): number {
  const luminancia = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}
