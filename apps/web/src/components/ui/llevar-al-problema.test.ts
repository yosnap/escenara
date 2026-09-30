import { afterEach, describe, expect, test } from "bun:test";
import path from "node:path";
import { CLASES_FLECHA_ANIMADA, enfocarProblema, llevarAlProblema, quitarSenal } from "./llevar-al-problema";

type Escucha = { objetivo: string; evento: string; fn: (e: unknown) => void; captura: boolean };

/**
 * Una página mínima con un bloque marcado: registra el desplazamiento, el foco, el aro, la flecha y **cada escucha
 * que se pone y se quita**, para comprobar que la señal sigue al bloque y que no deja nada colgando.
 */
function paginaFalsa({ reducir = false, oculto = false, panel = "clip" as string | null } = {}) {
  const eventos: string[] = [];
  const pendientes: (() => void)[] = [];
  const intervalos = new Map<number, () => void>();
  const escuchas: Escucha[] = [];
  const atributos = new Map<string, string>();
  const anadidos: {
    atributos: Map<string, string>;
    className: string;
    quitado: boolean;
    style: Record<string, string>;
  }[] = [];
  const rect = { top: 300, left: 100, width: 400 };
  const conEscuchas = (objetivo: string) => ({
    addEventListener: (evento: string, fn: (e: unknown) => void, captura?: boolean) =>
      escuchas.push({ objetivo, evento, fn, captura: captura === true }),
    removeEventListener: (evento: string, fn: (e: unknown) => void, captura?: boolean) => {
      const i = escuchas.findIndex(
        (e) => e.objetivo === objetivo && e.evento === evento && e.fn === fn && e.captura === (captura === true),
      );
      if (i >= 0) escuchas.splice(i, 1);
    },
  });
  const control = { focus: (o: FocusOptions) => eventos.push(`foco:${o.preventScroll}`) };
  const marca = {
    ...conEscuchas("bloque"),
    isConnected: true,
    oculto,
    tabIndex: 0,
    offsetWidth: 0,
    matches: () => false,
    querySelector: () => control,
    closest: (selector: string) =>
      selector === "[hidden]" ? (marca.oculto ? {} : null) : panel ? { getAttribute: () => panel } : null,
    scrollIntoView: (o: ScrollIntoViewOptions) => eventos.push(`desplazar:${o.behavior}`),
    getBoundingClientRect: () => ({ ...rect }),
    setAttribute: (k: string, v: string) => atributos.set(k, v),
    removeAttribute: (k: string) => atributos.delete(k),
    contains: () => false,
    focus: () => eventos.push("foco-bloque"),
  };
  let siguiente = 1;
  const ventana = {
    ...conEscuchas("ventana"),
    matchMedia: () => ({ matches: reducir }),
    scrollX: 0,
    scrollY: 1000,
    innerWidth: 1200,
    setTimeout: (f: () => void) => pendientes.push(f),
    clearTimeout: () => {},
    setInterval: (f: () => void) => {
      intervalos.set(siguiente, f);
      return siguiente++;
    },
    clearInterval: (id: number) => intervalos.delete(id),
  };
  const documento = {
    ...conEscuchas("documento"),
    defaultView: ventana,
    querySelector: () => marca,
    createElement: () => {
      const flecha = {
        atributos: new Map<string, string>(),
        className: "",
        quitado: false,
        style: {} as Record<string, string>,
        innerHTML: "",
        setAttribute(k: string, v: string) {
          flecha.atributos.set(k, v);
        },
        remove() {
          flecha.quitado = true;
        },
      };
      return flecha;
    },
    body: { appendChild: (n: (typeof anadidos)[number]) => anadidos.push(n) },
  };
  /** Dispara las escuchas de un evento, como haría el navegador. */
  const disparar = (evento: string, datos: unknown = {}) => {
    for (const e of escuchas.filter((x) => x.evento === evento)) e.fn(datos);
  };
  return {
    documento: documento as unknown as Document,
    eventos,
    pendientes,
    intervalos,
    escuchas,
    atributos,
    anadidos,
    rect,
    marca,
    disparar,
  };
}

afterEach(() => quitarSenal());

describe("llevar al problema en la página", () => {
  test("desplaza con suavidad, enfoca sin mover la página, resalta y pone la flecha", () => {
    const p = paginaFalsa();
    expect(enfocarProblema("clip-derechos", p.documento)).toBe(true);
    expect(p.eventos).toEqual(["desplazar:smooth", "foco:true"]);
    expect(p.atributos.get("data-resaltado")).toBe("true");
    const flecha = p.anadidos[0];
    expect(flecha?.atributos.get("aria-hidden")).toBe("true");
    expect(flecha?.className).toContain(CLASES_FLECHA_ANIMADA);
  });

  test("con «reducir movimiento» el desplazamiento es directo", () => {
    const p = paginaFalsa({ reducir: true });
    enfocarProblema("clip-derechos", p.documento);
    expect(p.eventos[0]).toBe("desplazar:auto");
  });

  test("señalar otro bloque quita la flecha anterior: nunca hay dos", () => {
    const p = paginaFalsa();
    enfocarProblema("a", p.documento);
    enfocarProblema("b", p.documento);
    expect(p.anadidos.map((f) => f.quitado)).toEqual([true, false]);
  });

  test("un bloque de un paso oculto no se enfoca", () => {
    const p = paginaFalsa({ oculto: true });
    expect(enfocarProblema("clip-derechos", p.documento)).toBe(false);
    expect(p.anadidos).toHaveLength(0);
  });

  test("sin paso en el problema, cambia al paso del panel que lo contiene y enfoca al pintarse", () => {
    const p = paginaFalsa({ panel: "clip" });
    const idos: string[] = [];
    llevarAlProblema(
      { id: "clip-derechos", texto: "x" },
      { actual: "escena", ir: (paso) => idos.push(paso), estaBloqueado: () => false, avisar: () => {} },
      p.documento,
    );
    expect(idos).toEqual(["clip"]);
    expect(p.eventos).toEqual([]);
    p.pendientes.shift()?.();
    expect(p.eventos).toEqual(["desplazar:smooth", "foco:true"]);
  });

  test("en el mismo paso no cambia de paso: enfoca directamente", () => {
    const p = paginaFalsa({ panel: "escena" });
    const idos: string[] = [];
    llevarAlProblema(
      { id: "descripcion", texto: "x" },
      { actual: "escena", ir: (paso) => idos.push(paso), estaBloqueado: () => false, avisar: () => {} },
      p.documento,
    );
    expect(idos).toEqual([]);
    expect(p.eventos[0]).toBe("desplazar:smooth");
  });

  test("un paso bloqueado no se abre: se avisa", () => {
    const p = paginaFalsa({ panel: "clip" });
    const avisos: string[] = [];
    llevarAlProblema(
      { id: "clip-derechos", texto: "x" },
      { actual: "escena", ir: () => avisos.push("ir"), estaBloqueado: () => true, avisar: (paso) => avisos.push(paso) },
      p.documento,
    );
    expect(avisos).toEqual(["clip"]);
  });
});

describe("la flecha sigue al bloque", () => {
  test("dentro de un contenedor que se desplaza (un diálogo), se recoloca al desplazarse y al terminar", () => {
    const p = paginaFalsa();
    enfocarProblema("vistas-sin-terceros", p.documento);
    const flecha = p.anadidos[0];
    const antes = flecha?.style.top;
    // El diálogo se desplaza: la ventana no se mueve (scrollY igual), pero el bloque sube 250 px en pantalla.
    p.rect.top = 50;
    expect(p.escuchas.some((e) => e.objetivo === "documento" && e.evento === "scroll" && e.captura)).toBe(true);
    p.disparar("scroll");
    expect(flecha?.style.top).not.toBe(antes);
    expect(flecha?.style.top).toBe(`${50 + 1000 - 40 - 6}px`);
    p.rect.top = 20;
    p.disparar("scrollend");
    expect(flecha?.style.top).toBe(`${20 + 1000 - 40 - 6}px`);
  });

  test("también se recoloca sola cada poco (una imagen que carga y mueve el bloque)", () => {
    const p = paginaFalsa();
    enfocarProblema("a", p.documento);
    p.rect.top = 120;
    for (const f of p.intervalos.values()) f();
    expect(p.anadidos[0]?.style.top).toBe(`${120 + 1000 - 40 - 6}px`);
  });
});

describe("la flecha no se queda colgando", () => {
  const sinRastro = (p: ReturnType<typeof paginaFalsa>) => {
    expect(p.anadidos.every((f) => f.quitado)).toBe(true);
    expect(p.atributos.has("data-resaltado")).toBe(false);
    expect(p.escuchas).toEqual([]);
    expect(p.intervalos.size).toBe(0);
  };

  test("al pasar el tiempo se quita todo: flecha, aro, escuchas y vigilancia", () => {
    const p = paginaFalsa();
    enfocarProblema("a", p.documento);
    expect(p.escuchas.length).toBeGreaterThan(0);
    p.pendientes.shift()?.();
    sinRastro(p);
  });

  test("con Escape (se cierra el diálogo)", () => {
    const p = paginaFalsa();
    enfocarProblema("a", p.documento);
    p.disparar("keydown", { key: "Tab" });
    expect(p.anadidos[0]?.quitado).toBe(false);
    p.disparar("keydown", { key: "Escape" });
    sinRastro(p);
  });

  test("cuando el bloque sale de la página (se desmonta o se cambia de pantalla)", () => {
    const p = paginaFalsa();
    enfocarProblema("a", p.documento);
    p.marca.isConnected = false;
    for (const f of [...p.intervalos.values()]) f();
    sinRastro(p);
  });

  test("cuando su paso se oculta", () => {
    const p = paginaFalsa();
    enfocarProblema("a", p.documento);
    p.marca.oculto = true;
    p.disparar("scroll");
    sinRastro(p);
  });

  test("al tocar el campo (se resuelve)", () => {
    const p = paginaFalsa();
    enfocarProblema("a", p.documento);
    p.disparar("change");
    sinRastro(p);
  });
});

describe("el aro que late", () => {
  test("es un aro completo de marca, y el latido solo corre sin «reducir movimiento»", async () => {
    const css = await Bun.file(path.resolve(import.meta.dir, "../../app/globals.css")).text();
    const base = css.match(/\[data-resaltado\]\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(base).toContain("outline: 3px solid var(--color-acento)");
    expect(base).not.toContain("animation");
    const conMovimiento = css.match(
      /@media \(prefers-reduced-motion: no-preference\)\s*\{\s*\[data-resaltado\]\s*\{([^}]*)\}/,
    )?.[1];
    expect(conMovimiento).toContain("animation: latido-requisito");
    // Con «reducir movimiento», la regla global deja cualquier animación en un instante.
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation-duration: 1ms !important/);
  });
});
