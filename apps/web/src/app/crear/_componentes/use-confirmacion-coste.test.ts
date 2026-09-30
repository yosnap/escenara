import { describe, expect, test } from "bun:test";
import {
  ajustarConfirmacion,
  type CasillasMarcadas,
  contextosDeConfirmacion,
  type EstadoInterno,
  estadoInicialDeConfirmacion,
} from "./use-confirmacion-coste";

/**
 * Una confirmación vale para lo que se leyó y para nada más: las casillas se desmarcan al cambiar de camino, de imagen
 * o de clip en marcha, y el aviso de gasto también al cambiar el precio.
 */
const CONTEXTO = { vigente: true, imagen: "img-1", sello: "s1" };
const marcar = (estado: EstadoInterno, casillas: Partial<CasillasMarcadas>): EstadoInterno => ({
  ...estado,
  casillas: { ...estado.casillas, ...casillas },
});
const TODAS = { derechos: true, derechoMarca: true, avisoAceptado: true };
const NINGUNA = { derechos: false, derechoMarca: false, avisoAceptado: false };

describe("reinicio de las casillas", () => {
  test("sin cambios en el contexto se devuelve el mismo estado", () => {
    const estado = marcar(estadoInicialDeConfirmacion(CONTEXTO), TODAS);
    expect(ajustarConfirmacion(estado, { ...CONTEXTO })).toBe(estado);
  });

  test("al dejar de ser vigente y volver, quedan desmarcadas", () => {
    let estado = marcar(estadoInicialDeConfirmacion(CONTEXTO), TODAS);
    estado = ajustarConfirmacion(estado, { ...CONTEXTO, vigente: false });
    expect(estado.casillas).toEqual(NINGUNA);
    estado = ajustarConfirmacion(marcar(estado, { derechos: true }), CONTEXTO);
    expect(estado.casillas).toEqual(NINGUNA);
  });

  test("cambiar la imagen desmarca los derechos y el aviso", () => {
    const estado = marcar(estadoInicialDeConfirmacion(CONTEXTO), TODAS);
    expect(ajustarConfirmacion(estado, { ...CONTEXTO, imagen: "img-2" }).casillas).toEqual(NINGUNA);
  });

  test("cambiar el precio (modelo, duración o trend) desmarca solo el aviso de gasto", () => {
    const estado = marcar(estadoInicialDeConfirmacion(CONTEXTO), TODAS);
    expect(ajustarConfirmacion(estado, { ...CONTEXTO, sello: "s2" }).casillas).toEqual({
      derechos: true,
      derechoMarca: true,
      avisoAceptado: false,
    });
  });
});

describe("contexto de cada confirmación", () => {
  const base = {
    origen: "fotograma" as const,
    sujetoDelFotograma: "p1",
    selloFotograma: "sf",
    clipPorConfirmar: false,
    imagenDelClip: undefined,
    selloClip: "sc",
  };

  test("el fotograma solo es vigente en el camino de generar un fotograma", () => {
    expect(contextosDeConfirmacion(base).fotograma.vigente).toBe(true);
    expect(contextosDeConfirmacion({ ...base, origen: "imagen" }).fotograma.vigente).toBe(false);
  });

  test("marcar «derecho a usar la imagen», cambiar de camino y volver: desmarcada", () => {
    const contexto = (origen: "fotograma" | "imagen") => contextosDeConfirmacion({ ...base, origen }).fotograma;
    let estado = marcar(estadoInicialDeConfirmacion(contexto("fotograma")), { derechos: true });
    estado = ajustarConfirmacion(estado, contexto("imagen"));
    estado = ajustarConfirmacion(estado, contexto("fotograma"));
    expect(estado.casillas.derechos).toBe(false);
  });

  test("el clip es vigente mientras hay imagen y no hay un clip en marcha", () => {
    expect(contextosDeConfirmacion({ ...base, clipPorConfirmar: true, imagenDelClip: "m1" }).clip).toEqual({
      vigente: true,
      imagen: "m1",
      sello: "sc",
    });
    expect(contextosDeConfirmacion(base).clip.vigente).toBe(false);
  });
});
