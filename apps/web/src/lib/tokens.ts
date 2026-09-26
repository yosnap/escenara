/** Genera las variables CSS de la interfaz a partir de docs/branding/escenara.brand.json. */
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

export function generarCss(marca: Marca): string {
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
  ];
  return [
    `/* Generado desde docs/branding/escenara.brand.json (marca ${marca.brandVersion}). No editar a mano: bun run tokens */`,
    ":root {",
    "  color-scheme: light;",
    ...comunes,
    ...claro,
    "}",
    "",
    "@media (prefers-color-scheme: dark) {",
    '  :root:not([data-theme="light"]) {',
    "    color-scheme: dark;",
    ...oscuro.map((l) => `  ${l}`),
    "  }",
    "}",
    "",
    ':root[data-theme="dark"] {',
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
