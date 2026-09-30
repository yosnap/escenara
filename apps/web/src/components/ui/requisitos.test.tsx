import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ModeloElegible } from "@/lib/catalogo";
import type { PasoDelFlujo } from "@/lib/multipaso";
import type { Requisito } from "@/lib/requisitos";
import { Casilla } from "./choice";
import { Campo } from "./field";
import { opcionesDeSelectorDeModelo } from "./modelo";
import { BarraDePasos } from "./multipaso";
import { AvisoRequisitos, irARequisito, MarcaRequisito } from "./requisitos";

/**
 * Los requisitos pendientes se ven donde importan: el bloque de arriba con cada punto como botón, el campo marcado
 * con su aro y su mensaje, y el número en la barra de pasos. Todo con texto además de color.
 */
const REQUISITOS: Requisito[] = [
  { id: "descripcion", paso: "escena", texto: "Falta describir la escena." },
  { id: "clip-derechos", paso: "clip", texto: "Falta confirmar que tienes derecho a usar la imagen." },
];

describe("aviso de requisitos", () => {
  test("título, un botón por requisito y borde de error completo (no lateral)", () => {
    const html = renderToStaticMarkup(<AvisoRequisitos requisitos={REQUISITOS} onIr={() => {}} />);
    expect(html).toContain("Antes de generar, falta:");
    expect(html.match(/<button/g)?.length).toBe(2);
    expect(html).toContain("Falta describir la escena.");
    expect(html).toContain("Ir al campo");
    expect(html).toContain("border-2 border-error");
    expect(html).not.toMatch(/\bborder-[lrse](-|\b)/);
  });

  test("sin requisitos no pinta nada", () => {
    expect(renderToStaticMarkup(<AvisoRequisitos requisitos={[]} onIr={() => {}} />)).toBe("");
  });
});

describe("campo y casilla marcados", () => {
  test("el campo con requisito lleva su marca, aria-invalid y el mensaje debajo", () => {
    const html = renderToStaticMarkup(
      <Campo etiqueta="Qué quieres ver" requisito="descripcion" error="Falta describir la escena.">
        {(props) => <textarea {...props} />}
      </Campo>,
    );
    expect(html).toContain('data-requisito="descripcion"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain("Falta describir la escena.");
  });

  test("sin error el campo no se marca como inválido", () => {
    const html = renderToStaticMarkup(
      <Campo etiqueta="Qué quieres ver" requisito="descripcion">
        {(props) => <textarea {...props} />}
      </Campo>,
    );
    expect(html).not.toContain('aria-invalid="true"');
  });

  test("la casilla pendiente lleva aro de error completo, aria-invalid y el mensaje", () => {
    const html = renderToStaticMarkup(
      <Casilla etiqueta="Tengo derecho" requisito="clip-derechos" error="Falta confirmar que tienes derecho." />,
    );
    expect(html).toContain('data-requisito="clip-derechos"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain("ring-2 ring-error");
    expect(html).toContain("Falta confirmar que tienes derecho.");
  });

  test("la casilla sin nada pendiente es la de siempre, sin envoltorio ni marca", () => {
    const html = renderToStaticMarkup(<Casilla etiqueta="Tengo derecho" />);
    expect(html).not.toContain("data-requisito");
    expect(html).not.toContain('aria-invalid="true"');
    expect(html.startsWith("<label")).toBe(true);
  });

  test("el envoltorio de un control sin marca propia lo señala igual", () => {
    const html = renderToStaticMarkup(
      <MarcaRequisito id="fotograma-modelo" error="El modelo elegido no acepta fotos.">
        <span>selector</span>
      </MarcaRequisito>,
    );
    expect(html).toContain('data-requisito="fotograma-modelo"');
    expect(html).toContain("ring-error");
    expect(html).toContain("El modelo elegido no acepta fotos.");
  });
});

describe("barra de pasos con requisitos", () => {
  const pasos: PasoDelFlujo[] = [
    { id: "escena", titulo: "Describe la escena", corto: "Escena", estado: "en-curso", pendientes: 2 },
    { id: "coste", titulo: "Revisa el coste", corto: "Coste", estado: "pendiente", pendientes: 1 },
    { id: "clip", titulo: "El clip", corto: "Clip", estado: "pendiente" },
  ];
  const html = renderToStaticMarkup(
    <BarraDePasos
      etiqueta="Pasos"
      pasos={pasos}
      actual="escena"
      visitados={["escena"]}
      onIr={() => {}}
      onNoDisponible={() => {}}
    />,
  );

  test("el paso con requisitos pendientes dice cuántos faltan, en número y en texto", () => {
    expect(html).toContain("Faltan 2");
    expect(html).toContain("Faltan 1");
    expect(html).toContain("faltan 2 requisitos");
    expect(html).toContain("falta 1 requisito");
  });

  test("el paso sin requisitos sigue diciendo su estado", () => {
    expect(html).toContain("Paso 3: El clip (pendiente)");
  });
});

describe("selector de modelo con la duración de un trend", () => {
  const modelo = (id: string, segundos: number[]): ModeloElegible => ({
    modelo: id,
    nombre: id,
    conVoz: true,
    unidad: "vídeo",
    estado: "validado",
    creditos: 10,
    precioPublicado: false,
    duracionesConCoste: segundos.map((s) => ({
      segundos: s,
      creditos: 10,
      unidad: `clip de ${s} s`,
      publicado: false,
    })),
    duraciones: segundos,
    maximoReferencias: 1,
  });
  const modelos = [modelo("fast", [4, 8]), modelo("pro", [4, 6, 8])];

  test("los modelos sin tarifa para la duración siguen en la lista, no disponibles y con el motivo", () => {
    const opciones = opcionesDeSelectorDeModelo(modelos, [6]);
    expect(opciones.map((o) => o.value)).toEqual(["fast", "pro"]);
    expect(opciones[0]?.deshabilitada).toBe(true);
    expect(opciones[0]?.descripcion).toContain("No disponible con este trend");
    expect(opciones[0]?.descripcion).toContain("no tiene clips de 6 s");
    expect(opciones[1]?.deshabilitada).toBeUndefined();
  });

  test("sin trend no se marca ninguno", () => {
    expect(opcionesDeSelectorDeModelo(modelos).some((o) => o.deshabilitada)).toBe(false);
  });

  test("un trend que admite cualquier duración no marca ninguno", () => {
    expect(opcionesDeSelectorDeModelo(modelos, []).some((o) => o.deshabilitada)).toBe(false);
  });
});

describe("ir a un requisito", () => {
  const requisito: Requisito = { id: "descripcion", paso: "escena", texto: "Falta describir la escena." };
  const original = (globalThis as { window?: unknown }).window;
  const conVentana = (prueba: () => void) => {
    (globalThis as { window?: unknown }).window = { setTimeout: () => 0 };
    try {
      prueba();
    } finally {
      (globalThis as { window?: unknown }).window = original;
    }
  };

  test("cambia al paso del requisito", () => {
    const visitados: string[] = [];
    conVentana(() =>
      irARequisito(requisito, {
        irAlPaso: (p) => visitados.push(p),
        estaBloqueado: () => false,
        avisarBloqueado: () => visitados.push("aviso"),
      }),
    );
    expect(visitados).toEqual(["escena"]);
  });

  test("un paso bloqueado no se abre: se avisa de por qué", () => {
    const eventos: string[] = [];
    irARequisito(requisito, {
      irAlPaso: (p) => eventos.push(`ir:${p}`),
      estaBloqueado: (p) => p === "escena",
      avisarBloqueado: (p) => eventos.push(`aviso:${p}`),
    });
    expect(eventos).toEqual(["aviso:escena"]);
  });
});
