import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { Problema } from "@/lib/llevar-al-problema";
import { Alerta, esDescartable, FlechaProblema } from "./alerta";
import { Aviso, AvisoEstado } from "./feedback";
import { CLASES_FLECHA_ANIMADA, enfocarProblema, llevarAlProblema, quitarSenal } from "./llevar-al-problema";

const veces = (html: string, texto: string) => html.split(texto).length - 1;

const ELEMENTOS: [Problema, Problema] = [
  { id: "descripcion", paso: "escena", texto: "Falta describir la escena." },
  { id: "clip-derechos", paso: "clip", texto: "Falta confirmar que tienes derecho a usar la imagen." },
];

describe("alerta: los tres tipos", () => {
  test("bloqueo: borde de error completo, rótulo «Bloqueo» y se anuncia como alerta", () => {
    const html = renderToStaticMarkup(<Alerta tipo="bloqueo">No hay clave de KIE: añádela en tu cuenta.</Alerta>);
    expect(html).toContain('data-alerta="bloqueo"');
    expect(html).toContain("border-2");
    expect(html).toContain("border-error");
    expect(html).toContain(">Bloqueo<");
    expect(html).toContain('role="alert"');
    expect(html).not.toMatch(/\bborder-[lrse](-|\b)/);
  });

  test("error: se anuncia como alerta, con icono oculto al lector y el rótulo en texto", () => {
    const html = renderToStaticMarkup(<Alerta tipo="error">KIE ha rechazado la imagen.</Alerta>);
    expect(html).toContain('role="alert"');
    expect(html).toContain(">Error<");
    expect(html).toContain('aria-hidden="true"');
  });

  test("aviso: se anuncia con cortesía (status), nunca como alerta", () => {
    const html = renderToStaticMarkup(<Alerta tipo="aviso">El precio se comprobó hace dos días.</Alerta>);
    expect(html).toContain('role="status"');
    expect(html).not.toContain('role="alert"');
    expect(html).toContain("border-aviso/60");
  });

  test("hecho: estado, sin nada a lo que llevar", () => {
    const html = renderToStaticMarkup(<Alerta tipo="hecho">Guardado.</Alerta>);
    expect(html).toContain('role="status"');
    expect(html).not.toContain("<button");
  });
});

describe("alerta: accesibilidad", () => {
  test("el mensaje se anuncia una sola vez y la lista queda fuera de la región viva", () => {
    const html = renderToStaticMarkup(
      <Alerta tipo="bloqueo" titulo="Antes de generar, falta:" elementos={ELEMENTOS} onIr={() => {}} />,
    );
    expect(veces(html, "Antes de generar, falta:")).toBe(1);
    expect(veces(html, "Falta describir la escena.")).toBe(1);
    const [antesDeLaLista] = html.split("<ul");
    expect(antesDeLaLista).toContain('role="alert"');
    expect(antesDeLaLista).not.toContain("Falta describir la escena.");
  });

  test("lo que ya estaba en la pantalla no se anuncia: es una región con el nombre de su título", () => {
    const html = renderToStaticMarkup(
      <Alerta
        tipo="bloqueo"
        titulo="Antes de generar, falta:"
        elementos={ELEMENTOS}
        anuncio="ninguno"
        onIr={() => {}}
      />,
    );
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain('role="status"');
    const id = html.match(/aria-labelledby="([^"]+)"/)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`id="${id}"`);
  });

  test("todos los botones miden al menos 44 px", () => {
    const html = renderToStaticMarkup(
      <Alerta tipo="aviso" descartable elementos={ELEMENTOS} destino={ELEMENTOS[0]} onIr={() => {}}>
        Mensaje
      </Alerta>,
    );
    const botones = html.match(/<button[^>]*>/g) ?? [];
    expect(botones.length).toBeGreaterThan(0);
    for (const b of botones) expect(b).toMatch(/min-h-11|size-11/);
  });
});

describe("alerta: varios problemas y llevar a ellos", () => {
  test("un botón por problema, el primero destacado y «Ir al primero»", () => {
    const html = renderToStaticMarkup(<Alerta tipo="bloqueo" elementos={ELEMENTOS} onIr={() => {}} />);
    expect(veces(html, "Ir al campo")).toBe(2);
    expect(html).toContain("Ir al primero");
    const [primero, segundo] = html.split("<li").slice(1);
    expect(primero).toContain("bg-elevada font-semibold");
    expect(segundo).not.toContain("bg-elevada font-semibold");
  });

  test("con un solo problema no hace falta «Ir al primero»", () => {
    const html = renderToStaticMarkup(<Alerta tipo="bloqueo" elementos={[ELEMENTOS[0]]} onIr={() => {}} />);
    expect(html).not.toContain("Ir al primero");
  });

  test("un problema sin sitio en la pantalla se lee pero no se pulsa", () => {
    const html = renderToStaticMarkup(
      <Alerta tipo="bloqueo" elementos={[{ texto: "El proveedor no responde." }]} onIr={() => {}} />,
    );
    expect(html).toContain("El proveedor no responde.");
    expect(html).not.toContain("<button");
  });

  test("con destino, la acción «Ir al campo» acompaña al mensaje", () => {
    const html = renderToStaticMarkup(
      <Alerta tipo="error" destino={ELEMENTOS[0]} onIr={() => {}}>
        Describe la escena con más detalle.
      </Alerta>,
    );
    expect(html).toContain("Ir al campo");
  });
});

describe("alerta: qué se puede descartar", () => {
  test("solo un aviso o un hecho, y nunca si protege dinero o consentimiento", () => {
    expect(esDescartable("aviso", true)).toBe(true);
    expect(esDescartable("hecho", true)).toBe(true);
    expect(esDescartable("aviso", true, true)).toBe(false);
    expect(esDescartable("bloqueo", true)).toBe(false);
    expect(esDescartable("error", true)).toBe(false);
    expect(esDescartable("aviso", false)).toBe(false);
  });

  test("el botón de descartar solo sale cuando se puede", () => {
    const con = renderToStaticMarkup(
      <Alerta tipo="aviso" descartable>
        Informativo
      </Alerta>,
    );
    expect(con).toContain('aria-label="Descartar aviso"');
    const protegido = renderToStaticMarkup(
      <Alerta tipo="aviso" descartable protege>
        Aviso de gasto
      </Alerta>,
    );
    expect(protegido).not.toContain("Descartar aviso");
    const bloqueo = renderToStaticMarkup(
      <Alerta tipo="bloqueo" descartable>
        Falta la casilla
      </Alerta>,
    );
    expect(bloqueo).not.toContain("Descartar aviso");
  });
});

describe("compatibilidad: Aviso y AvisoEstado salen por la alerta", () => {
  test("Aviso de error sigue anunciándose al momento y el de información con cortesía", () => {
    expect(renderToStaticMarkup(<Aviso tono="error">Falló</Aviso>)).toContain('role="alert"');
    expect(renderToStaticMarkup(<Aviso tono="info">Info</Aviso>)).toContain('role="status"');
    expect(renderToStaticMarkup(<Aviso tono="correcto">Hecho</Aviso>)).toContain('data-alerta="hecho"');
  });

  test("AvisoEstado conserva el título del estado como rótulo y se anuncia con cortesía", () => {
    const html = renderToStaticMarkup(<AvisoEstado estado="bloqueado" motivo="Sin presupuesto." />);
    expect(html).toContain('data-alerta="bloqueo"');
    expect(html).toContain("Bloqueado por un requisito");
    expect(html).toContain('role="status"');
    expect(veces(html, "Sin presupuesto.")).toBe(1);
  });
});

describe("flecha", () => {
  test("oculta al lector y con rebote solo si no se pide reducir el movimiento", () => {
    const animada = renderToStaticMarkup(<FlechaProblema />);
    expect(animada).toContain('aria-hidden="true"');
    expect(animada).toContain("motion-safe:animate-[rebote-flecha");
    expect(animada).toContain("motion-reduce:animate-none");
    const quieta = renderToStaticMarkup(<FlechaProblema animada={false} />);
    expect(quieta).not.toContain("animate-");
  });
});

/** Una página mínima con un bloque marcado, para probar el desplazamiento, el foco, el aro y la flecha. */
function paginaFalsa({ reducir = false, oculto = false, panel = "clip" as string | null } = {}) {
  const eventos: string[] = [];
  const pendientes: (() => void)[] = [];
  const atributos = new Map<string, string>();
  const anadidos: { atributos: Map<string, string>; className: string; quitado: boolean }[] = [];
  const control = { focus: (o: FocusOptions) => eventos.push(`foco:${o.preventScroll}`) };
  const marca = {
    tabIndex: 0,
    offsetWidth: 0,
    matches: () => false,
    querySelector: () => control,
    closest: (selector: string) =>
      selector === "[hidden]" ? (oculto ? {} : null) : panel ? { getAttribute: () => panel } : null,
    scrollIntoView: (o: ScrollIntoViewOptions) => eventos.push(`desplazar:${o.behavior}`),
    getBoundingClientRect: () => ({ top: 300, left: 100, width: 400 }),
    setAttribute: (k: string, v: string) => atributos.set(k, v),
    removeAttribute: (k: string) => atributos.delete(k),
    addEventListener: () => {},
    removeEventListener: () => {},
    contains: () => false,
    focus: () => eventos.push("foco-bloque"),
  };
  const ventana = {
    matchMedia: () => ({ matches: reducir }),
    scrollX: 0,
    scrollY: 1000,
    innerWidth: 1200,
    setTimeout: (f: () => void) => pendientes.push(f),
    clearTimeout: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  const documento = {
    defaultView: ventana,
    querySelector: () => marca,
    addEventListener: () => {},
    removeEventListener: () => {},
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
  return { documento: documento as unknown as Document, eventos, pendientes, atributos, anadidos };
}

describe("llevar al problema en la página", () => {
  test("desplaza con suavidad, enfoca sin mover la página, resalta y pone la flecha", () => {
    const p = paginaFalsa();
    expect(enfocarProblema("clip-derechos", p.documento)).toBe(true);
    expect(p.eventos).toEqual(["desplazar:smooth", "foco:true"]);
    expect(p.atributos.get("data-resaltado")).toBe("true");
    const flecha = p.anadidos[0];
    expect(flecha?.atributos.get("aria-hidden")).toBe("true");
    expect(flecha?.className).toContain(CLASES_FLECHA_ANIMADA);
    quitarSenal();
    expect(p.atributos.has("data-resaltado")).toBe(false);
    expect(flecha?.quitado).toBe(true);
  });

  test("con «reducir movimiento» el desplazamiento es directo", () => {
    const p = paginaFalsa({ reducir: true });
    enfocarProblema("clip-derechos", p.documento);
    expect(p.eventos[0]).toBe("desplazar:auto");
    quitarSenal();
  });

  test("señalar otro bloque quita la flecha anterior: nunca hay dos", () => {
    const p = paginaFalsa();
    enfocarProblema("a", p.documento);
    enfocarProblema("b", p.documento);
    expect(p.anadidos.map((f) => f.quitado)).toEqual([true, false]);
    quitarSenal();
  });

  test("un bloque de un paso oculto no se enfoca", () => {
    const p = paginaFalsa({ oculto: true });
    expect(enfocarProblema("clip-derechos", p.documento)).toBe(false);
    expect(p.anadidos).toHaveLength(0);
  });

  test("sin paso en el problema, cambia al paso del panel que lo contiene y enfoca al pintarse", () => {
    const p = paginaFalsa({ oculto: false, panel: "clip" });
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
    quitarSenal();
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
    quitarSenal();
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
