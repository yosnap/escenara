import { describe, expect, test } from "bun:test";
import path from "node:path";
import { Glob } from "bun";

/**
 * Lo que axe no puede ver sin pintar la página, comprobado sobre el código de toda la aplicación:
 *
 * - **Foco visible** en todo control: la regla global `:focus-visible` pinta el aro, así que nadie puede quitarlo
 *   (`outline-none`) de un control interactivo sin poner otro indicador en su lugar.
 * - **Objetivos táctiles** de al menos 24 px (WCAG 2.2, 2.5.8): ningún control con un tamaño explícito menor, y los
 *   botones de solo texto llevan altura mínima.
 * - **Tablas anchas** en una región desplazable que se alcanza con el teclado (`TablaDesplazable`).
 */

const src = path.resolve(import.meta.dir, "../..");
const fuentes: { fichero: string; codigo: string }[] = [];
for await (const fichero of new Glob("**/*.tsx").scan(src)) {
  if (fichero.includes(".test.")) continue;
  fuentes.push({ fichero, codigo: await Bun.file(path.join(src, fichero)).text() });
}
const css = await Bun.file(path.join(src, "app/globals.css")).text();

/** Etiquetas de los controles con los que se interactúa. */
const APERTURA =
  /<(button|a|Link|input|textarea|select|summary|C\.Clear|C\.Trigger|C\.Input|S\.Trigger|D\.Close|Toggle|Radio\.Root|CB\.Root|SW\.Root)(?=[\s/>])/g;

/**
 * La etiqueta de apertura completa desde `inicio`: termina en el primer `>` fuera de llaves y de comillas, así que
 * `onClick={() => …}` no la corta.
 */
function etiquetaCompleta(codigo: string, inicio: number): string {
  let llaves = 0;
  let comilla: string | null = null;
  for (let i = inicio; i < codigo.length; i++) {
    const c = codigo[i];
    if (comilla) {
      if (c === comilla && codigo[i - 1] !== "\\") comilla = null;
    } else if (c === '"' || c === "'" || c === "`") comilla = c;
    else if (c === "{") llaves++;
    else if (c === "}") llaves--;
    else if (c === ">" && llaves === 0) return codigo.slice(inicio, i + 1);
  }
  return codigo.slice(inicio);
}

/** Cada control con sus clases: el literal de `className` o el primero de `cn(…)` / `claseX(…)` no cuenta. */
const controles = () =>
  fuentes.flatMap(({ fichero, codigo }) =>
    [...codigo.matchAll(APERTURA)].map((m) => {
      const etiqueta = etiquetaCompleta(codigo, m.index ?? 0);
      const clases = /className=(?:"([^"]*)"|\{cn\(\s*"([^"]*)")/.exec(etiqueta);
      return { fichero, etiqueta: m[1] ?? "", resto: etiqueta, clases: clases?.[1] ?? clases?.[2] ?? "" };
    }),
  );

describe("controles accesibles en toda la aplicación", () => {
  test("hay controles que revisar", () => {
    expect(controles().length).toBeGreaterThan(100);
  });

  test("el aro de foco global existe y ningún control lo quita sin otro indicador", () => {
    expect(css).toMatch(/:focus-visible\s*\{\s*outline: 2px solid var\(--focus\);/);
    const sinAro = controles()
      .filter((c) => /(^|\s)outline-(none|hidden|0)(\s|$)/.test(c.clases))
      .filter(
        (c) => !/focus(-visible|-within)?:(ring|outline|border)|has-focus-visible|data-highlighted/.test(c.clases),
      )
      // Un campo dentro de un grupo que enseña el foco con `focus-within` (la multiselección) lo tiene en el grupo.
      .filter((c) => !(c.etiqueta === "C.Input" && c.fichero.endsWith("multi-select.tsx")))
      .map((c) => `${c.fichero}: <${c.etiqueta}> ${c.clases.slice(0, 80)}`);
    expect(sinAro).toEqual([]);
  });

  test("ningún control mide menos de 24 px", () => {
    const pequenos = controles()
      .filter((c) => !/(^|\s)sr-only(\s|$)/.test(c.clases))
      .flatMap((c) =>
        (c.clases.match(/(?:^|\s)(?:size|h|min-h|w|min-w)-(\d+(?:\.\d+)?)(?=\s|$)/g) ?? [])
          .filter((clase) => Number(clase.trim().split("-").pop()) < 6)
          .map((clase) => `${c.fichero}: <${c.etiqueta}> ${clase.trim()}`),
      );
    expect(pequenos).toEqual([]);
  });

  test("los botones de solo texto tienen altura mínima", () => {
    // Con las clases calculadas (`claseBoton(…)`, una constante) manda su componente: `button.tsx` da 36 px o más.
    const sinAltura = controles()
      .filter((c) => c.etiqueta === "button" && c.clases !== "")
      .filter((c) => !/(size-|(^|\s)h-|min-h-|py-|(^|\s)p-|inset-0|sr-only|aspect-)/.test(c.clases))
      .map((c) => `${c.fichero}: ${c.clases.slice(0, 80)}`);
    expect(sinAltura).toEqual([]);
  });

  test("toda tabla va dentro de su región desplazable (tabla a tabla, no por fichero)", () => {
    const sueltas: string[] = [];
    for (const { fichero, codigo } of fuentes) {
      const lineas = codigo.split("\n");
      for (const m of codigo.matchAll(/<table\b/g)) {
        const antes = codigo.slice(0, m.index);
        // Abierta y sin cerrar antes de esta tabla: la envuelve de verdad.
        const dentro =
          (antes.match(/<TablaDesplazable\b/g)?.length ?? 0) > (antes.match(/<\/TablaDesplazable>/g)?.length ?? 0);
        const linea = antes.split("\n").length - 1;
        const permitido = [lineas[linea - 1], lineas[linea - 2]].some((l) => l?.includes("permitido:"));
        if (!dentro && !permitido) sueltas.push(`${fichero}:${linea + 1}`);
      }
    }
    expect(sueltas).toEqual([]);
  });

  test("la página dice su idioma y ofrece saltar al contenido", async () => {
    const layout = await Bun.file(path.join(src, "app/layout.tsx")).text();
    expect(layout).toMatch(/<html\s+lang=\{/);
    expect(layout).toContain('href="#contenido"');
    expect(layout).toContain("Saltar al contenido");
    // El destino recibe el foco (y lo enseña): cada #contenido es un <main> con tabIndex={-1}.
    const sinFoco = fuentes.flatMap(({ fichero, codigo }) =>
      [...codigo.matchAll(/<\w+[^>]*\bid="contenido"[^>]*>/g)]
        .filter((m) => !/^<main\b/.test(m[0]) || !m[0].includes("tabIndex={-1}"))
        .map(() => fichero),
    );
    expect(sinFoco).toEqual([]);
    // La 404 propia también tiene su #contenido.
    expect(fuentes.find((f) => f.fichero === "app/not-found.tsx")?.codigo).toMatch(
      /<main\s+id="contenido"\s+tabIndex=\{-1\}/,
    );
    // Todas las páginas tienen su contenido principal en #contenido (o lo pone su layout).
    const sinContenido: string[] = [];
    for (const { fichero, codigo } of fuentes) {
      if (!fichero.endsWith("/page.tsx") && fichero !== "app/page.tsx") continue;
      if (codigo.includes('id="contenido"')) continue;
      const carpeta = path.dirname(fichero);
      const conLayout = fuentes.some(
        (f) =>
          f.fichero.endsWith("layout.tsx") &&
          carpeta.startsWith(path.dirname(f.fichero)) &&
          f.fichero !== "app/layout.tsx" &&
          f.codigo.includes('id="contenido"'),
      );
      // El catálogo del admin pinta el suyo dentro de su componente.
      const marcoAdmin = fuentes.find((f) => f.fichero === "app/admin/ui-admin.tsx");
      const delegado =
        (codigo.includes("<Catalogo") &&
          /import[^;]*Catalogo[^;]*catalogo/.test(codigo) &&
          fuentes
            .find((f) => f.fichero === "app/admin/componentes/catalogo.tsx")
            ?.codigo.includes('<main id="contenido" tabIndex={-1}') === true) ||
        (codigo.includes("<PaginaAdmin") &&
          /import[^;]*PaginaAdmin[^;]*ui-admin/.test(codigo) &&
          marcoAdmin?.codigo.includes('<main id="contenido" tabIndex={-1}') === true);
      if (!conLayout && !delegado) sinContenido.push(fichero);
    }
    expect(sinContenido).toEqual([]);
  });
});
