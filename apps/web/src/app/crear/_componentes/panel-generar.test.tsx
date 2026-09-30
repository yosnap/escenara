import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { Estimacion } from "@/lib/generacion";
import type { Requisito } from "@/lib/requisitos";
import { PanelGenerar } from "./panel-generar";
import type { EstadoConfirmacion } from "./use-confirmacion-coste";

/**
 * El botón de generar sigue apagado por cada tipo de requisito (ahora con `aria-disabled`, para poder pulsarlo y que
 * señale lo que falta), y las casillas pendientes solo se marcan cuando toca.
 */
const ESTIMACION = {
  tipo: "animacion",
  modelo: "veo",
  nombreModelo: "Veo",
  conVoz: false,
  unidad: "clip",
  creditos: 30,
  euros: 0.15,
  saldo: null,
  alcanza: true,
  superaUmbral: false,
  umbral: 500,
  fuente: "t",
  comprobado: "2026-09-30",
  precioAntiguo: false,
  sello: "s",
  traduccion: null,
  segundos: 6,
  duraciones: [],
  sinReferencia: false,
} as unknown as Estimacion;

const confirmacion = (c: Partial<Pick<EstadoConfirmacion, "derechos" | "derechoMarca" | "avisoAceptado">> = {}) => ({
  derechos: true,
  derechoMarca: true,
  avisoAceptado: true,
  ...c,
  setDerechos: () => {},
  setDerechoMarca: () => {},
  setAvisoAceptado: () => {},
});

const pintar = (
  opciones: {
    bloqueos?: Requisito[];
    casillas?: Parameters<typeof confirmacion>[0];
    conProducto?: boolean;
    superaUmbral?: boolean;
    marcar?: boolean;
    avisoEnBloque?: boolean;
  } = {},
) =>
  renderToStaticMarkup(
    <PanelGenerar
      estimacion={{ ...ESTIMACION, superaUmbral: opciones.superaUmbral ?? false }}
      etiqueta="Animar 6 s"
      firma="f"
      bloqueos={opciones.bloqueos ?? []}
      avisosConfirmados={[]}
      conProducto={opciones.conProducto}
      envio="clip"
      paso="clip"
      confirmacion={confirmacion(opciones.casillas)}
      marcar={opciones.marcar}
      avisoEnBloque={opciones.avisoEnBloque}
      enviando={false}
      onGenerar={() => {}}
    />,
  );

const botonApagado = (html: string) => /<button[^>]*aria-disabled="true"[^>]*>[^<]*(<svg.*?<\/svg>)?Animar/s.test(html);

describe("botón de generar", () => {
  test("con todo confirmado está encendido", () => {
    const html = pintar();
    expect(html).toContain("Animar 6 s");
    expect(html).not.toContain('aria-disabled="true"');
    expect(html).not.toMatch(/<button[^>]*disabled=""/);
  });

  test.each([
    [
      "un bloqueo de la pantalla",
      { bloqueos: [{ id: "descripcion", paso: "escena", texto: "Falta describir la escena." }] },
    ],
    ["la casilla de derechos de la imagen", { casillas: { derechos: false } }],
    ["la casilla de la marca con producto", { conProducto: true, casillas: { derechoMarca: false } }],
    ["el aviso de gasto alto", { superaUmbral: true, casillas: { avisoAceptado: false } }],
  ])("apagado por %s", (_nombre, opciones) => {
    expect(botonApagado(pintar(opciones))).toBe(true);
  });

  test("la marca no se pide si no hay producto ni el aviso si no se supera el umbral", () => {
    expect(botonApagado(pintar({ casillas: { derechoMarca: false, avisoAceptado: false } }))).toBe(false);
  });
});

describe("marcado de las casillas pendientes", () => {
  test("al abrir el paso no hay nada en rojo, aunque falte la casilla", () => {
    const html = pintar({ casillas: { derechos: false } });
    expect(html).not.toContain('aria-invalid="true"');
    expect(html).not.toContain("Falta confirmar que tienes derecho a usar la imagen.</p>");
  });

  test("con el paso señalado, la casilla sale marcada con su mensaje", () => {
    const html = pintar({ casillas: { derechos: false }, marcar: true });
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('data-requisito="clip-derechos"');
  });

  test("con el bloque de requisitos arriba, la lista de aquí no se repite al lector de pantalla", () => {
    const html = pintar({ casillas: { derechos: false }, avisoEnBloque: true });
    // La alerta de aquí queda oculta al lector y sin botones (el bloque de arriba ya lleva a cada campo).
    expect(html).toContain('<div aria-hidden="true"><div data-alerta="bloqueo"');
    expect(html.split('aria-hidden="true"><div data-alerta')[1]?.split("</ul>")[0]).not.toContain("<button");
    const sinBloque = pintar({ casillas: { derechos: false } });
    expect(sinBloque).not.toContain('<div aria-hidden="true"><div data-alerta');
    expect(sinBloque).toContain("Ir al campo");
  });
});
