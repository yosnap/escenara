import { describe, expect, test } from "bun:test";
import type { Hechos } from "./controles/contrato";
import { hechosDeModelo } from "./controles/hechos";
import { evaluar } from "./controles/motor";
import type { EleccionDeTrabajo } from "./generacion/precios";
import {
  claseDeTrabajo,
  conDe,
  conMayuscula,
  DONDE_CAMBIAR_MODELO,
  enMensaje,
  modeloEnMensaje,
} from "./modelo-en-mensajes";
import { acotarCoste } from "./presupuesto/acotar";

const ADMIN = { esAdmin: true };
const USUARIO = { esAdmin: false };

describe("cómo se nombra un modelo según quién lee", () => {
  test("al usuario normal se le dice qué hace el modelo, nunca su nombre", () => {
    expect(modeloEnMensaje(USUARIO, "video", "Veo 3.1 Lite")).toBe("el modelo de vídeo que usas");
    expect(modeloEnMensaje(USUARIO, "imagen", "Nano Banana 2 Lite")).toBe("el modelo de imagen que usas");
    expect(modeloEnMensaje(USUARIO, "hablada", "Gemini Omni 1.1 Flash")).not.toContain("Gemini");
  });

  test("sin lector conocido se trata como usuario normal", () => {
    expect(modeloEnMensaje(null, "video", "Veo 3.1 Lite")).toBe("el modelo de vídeo que usas");
    expect(modeloEnMensaje(undefined, "video", "Veo 3.1 Lite")).not.toContain("Veo");
  });

  test("quien administra ve el nombre", () => {
    expect(modeloEnMensaje(ADMIN, "video", "Veo 3.1 Lite")).toBe("el modelo Veo 3.1 Lite");
    // Sin nombre conocido, también para el admin la frase neutra.
    expect(modeloEnMensaje(ADMIN, "video", " ")).toBe("el modelo de vídeo que usas");
  });

  test("las frases encajan al empezar oración y detrás de «de»", () => {
    expect(conMayuscula("el modelo de vídeo que usas")).toBe("El modelo de vídeo que usas");
    expect(conDe("el modelo de vídeo que usas")).toBe("del modelo de vídeo que usas");
    expect(enMensaje(undefined)).toBe("el modelo elegido");
    expect(DONDE_CAMBIAR_MODELO).toContain("Opciones avanzadas");
  });

  test("cada tipo de trabajo tiene su clase", () => {
    expect(claseDeTrabajo("fotograma")).toBe("imagen");
    expect(claseDeTrabajo("animacion")).toBe("video");
    expect(claseDeTrabajo("voz")).toBe("voz");
  });
});

/** Elección mínima para los hechos del motor: un modelo que no acepta referencias y con el precio caducado. */
const eleccion = {
  modelo: {
    modelo: "veo3_lite",
    nombre: "Veo 3.1 Lite",
    parametros: { maximoReferencias: 0, duraciones: [4], proporciones: ["9:16"] },
  },
  precio: { creditos: 60, unidad: "vídeo de 4 s", comprobado: "2020-01-01", sello: "s" },
} as unknown as EleccionDeTrabajo;

const hechosCon = (lector: { esAdmin: boolean }): Hechos =>
  ({
    tipo: "animacion",
    modelo: hechosDeModelo("animacion", eleccion, lector),
    personaje: { nombre: "Lucía", impedimentos: [], vistasSinCubrir: [], referenciasSenaladas: 0 },
    parametros: {
      exigirCoberturaVistas: false,
      exigirPrecioFresco: true,
      umbralFotosSenaladas: 99,
      verificarAfirmaciones: false,
    },
  }) as unknown as Hechos;

const motivos = (h: Hechos) =>
  evaluar(h)
    .frenos.map((r) => `${r.motivo} ${r.accion ?? ""}`)
    .join(" ");

describe("los motivos del motor de controles", () => {
  test("a un usuario normal le dicen la causa y qué hacer sin nombrar el modelo", () => {
    const texto = motivos(hechosCon(USUARIO));
    expect(texto).toContain("El modelo de vídeo que usas no acepta fotos de referencia");
    expect(texto).toContain("no se te ha cobrado");
    expect(texto).toContain("Opciones avanzadas");
    expect(texto).toContain("El precio del modelo de vídeo que usas se comprobó");
    expect(texto).not.toContain("Veo");
  });

  test("a quien administra le nombran el modelo", () => {
    const texto = motivos(hechosCon(ADMIN));
    expect(texto).toContain("El modelo Veo 3.1 Lite no acepta fotos de referencia");
    expect(texto).toContain("El precio del modelo Veo 3.1 Lite se comprobó");
  });

  test("la evidencia que ve el admin conserva el nombre del catálogo", () => {
    expect(hechosDeModelo("animacion", eleccion, USUARIO).nombre).toBe("Veo 3.1 Lite");
  });

  test("el motivo de un coste sin acotar no nombra el modelo", () => {
    const sinDuracion = {
      ...eleccion,
      modelo: { ...eleccion.modelo, parametros: { ...eleccion.modelo.parametros, duraciones: [] } },
    } as unknown as EleccionDeTrabajo;
    const acotacion = acotarCoste("animacion", sinDuracion);
    expect(acotacion.acotado).toBe(false);
    expect(!acotacion.acotado && acotacion.motivo).toContain("El modelo de vídeo que usas no declara cuánto dura");
    expect(!acotacion.acotado && acotacion.motivo).not.toContain("Veo");
  });
});
