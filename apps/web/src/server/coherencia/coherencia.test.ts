import { describe, expect, test } from "bun:test";
import { calcularCobertura, type ReferenciaParaCobertura } from "@/lib/captura-personaje";
import { UMBRAL_POR_DEFECTO, veredictoDe } from "@/lib/coherencia";
import {
  JEV_401,
  JEV_EMOCION_OPUESTA,
  JEV_GUION_FLOJO,
  JEV_IDENTIDAD_DUDOSA,
  JEV_IDENTIDAD_NO,
  JEV_IDENTIDAD_SI,
  JEV_MODELOS_200,
  respuestaGrabada,
} from "./fixtures";
import { decidirConJev, ErrorJev, mensajeDeErrorJev, modelosDeJev } from "./jev";
import { PREGUNTAS } from "./preguntas";

/**
 * Coherencia (0.24.0) sin llamar a nadie: Jev contesta con sus **respuestas grabadas** y la cobertura se calcula
 * sobre referencias a mano.
 *
 * Lo que fija:
 *
 * - las tres primitivas se normalizan a «cuánto encaja» y «cuánta confianza» de una sola manera;
 * - por debajo del umbral **no se actúa**, pase lo que pase con la respuesta;
 * - una vista generada cubre en un personaje real **solo** si su identidad pasa;
 * - un fallo de Jev no se convierte nunca en un veredicto, y su texto crudo no sale hacia el usuario.
 */

const CLAVE = "ts-clave-de-prueba-inventada-1234";

const contesta = (cuerpo: unknown, estado = 200) =>
  (async () => respuestaGrabada(cuerpo, estado)) as unknown as typeof fetch;

describe("normalización de las respuestas de Jev", () => {
  test("una `noul` afirmativa encaja y trae confianza alta", async () => {
    const respuesta = await decidirConJev({
      clave: CLAVE,
      estado: { a: "b" },
      pregunta: PREGUNTAS.identidad.pregunta,
      buscar: contesta(JEV_IDENTIDAD_SI),
    });
    expect(respuesta.encaja).toBeCloseTo(0.94, 3);
    // 0,94 está a 0,44 de la duda absoluta: 0,88 de confianza.
    expect(respuesta.confianza).toBeCloseTo(0.88, 3);
    expect(respuesta.modelo).toBe("jev-1.13.0");
    expect(respuesta.tokensEntrada).toBe(412);
    expect(veredictoDe(respuesta.encaja, respuesta.confianza, UMBRAL_POR_DEFECTO)).toBe("pasa");
  });

  test("una `noul` negativa no encaja, y con confianza alta el veredicto es «no pasa»", async () => {
    const respuesta = await decidirConJev({
      clave: CLAVE,
      estado: {},
      pregunta: PREGUNTAS.identidad.pregunta,
      buscar: contesta(JEV_IDENTIDAD_NO),
    });
    expect(respuesta.encaja).toBeCloseTo(0.06, 3);
    expect(veredictoDe(respuesta.encaja, respuesta.confianza, UMBRAL_POR_DEFECTO)).toBe("no_pasa");
  });

  test("una respuesta en la frontera manda a revisar, no da un «pasa» flojo", async () => {
    const respuesta = await decidirConJev({
      clave: CLAVE,
      estado: {},
      pregunta: PREGUNTAS.identidad.pregunta,
      buscar: contesta(JEV_IDENTIDAD_DUDOSA),
    });
    // 0,58 de probabilidad son 0,16 de confianza: no llega ni de lejos al umbral.
    expect(respuesta.encaja).toBeGreaterThan(0.5);
    expect(veredictoDe(respuesta.encaja, respuesta.confianza, UMBRAL_POR_DEFECTO)).toBe("revisar");
  });

  test("un `score` se lleva a 0–1 con el número de niveles de su escala", async () => {
    const respuesta = await decidirConJev({
      clave: CLAVE,
      estado: {},
      pregunta: PREGUNTAS.guion.pregunta,
      buscar: contesta(JEV_GUION_FLOJO),
    });
    // 0,9 sobre una escala de cuatro niveles (tres saltos) son 0,3 de encaje.
    expect(respuesta.encaja).toBeCloseTo(0.3, 3);
    expect(respuesta.confianza).toBeCloseTo(0.82, 3);
    expect(veredictoDe(respuesta.encaja, respuesta.confianza, UMBRAL_POR_DEFECTO)).toBe("no_pasa");
  });

  test("un `choice` suma las opciones que cuentan como encaje, no solo la elegida", async () => {
    const respuesta = await decidirConJev({
      clave: CLAVE,
      estado: {},
      pregunta: PREGUNTAS.emocion.pregunta,
      encajan: PREGUNTAS.emocion.encajan,
      buscar: contesta(JEV_EMOCION_OPUESTA),
    });
    // «coincide» 0,03 + «parecida» 0,06: la emoción no encaja.
    expect(respuesta.encaja).toBeCloseTo(0.09, 3);
    expect(respuesta.elegida).toBe("opuesta");
    expect(respuesta.probabilidades.opuesta).toBeCloseTo(0.82, 3);
    expect(veredictoDe(respuesta.encaja, respuesta.confianza, UMBRAL_POR_DEFECTO)).toBe("no_pasa");
  });
});

describe("fallos de Jev", () => {
  test("una clave rechazada es un rechazo probado y su texto crudo no sale hacia el usuario", async () => {
    const fallo = await decidirConJev({
      clave: CLAVE,
      estado: {},
      pregunta: PREGUNTAS.identidad.pregunta,
      buscar: contesta(JEV_401, 401),
    }).catch((error: unknown) => error);
    expect(fallo).toBeInstanceOf(ErrorJev);
    const error = fallo as ErrorJev;
    expect(error.codigo).toBe("rechazada");
    expect(error.rechazoProbado).toBe(true);
    const mensaje = mensajeDeErrorJev(error);
    expect(mensaje).toContain("rechazado la clave");
    // Ni la clave del proveedor ni su texto de error aparecen en lo que lee una persona.
    expect(mensaje).not.toContain("ts-XXXXXXXXXXXX");
    expect(mensaje).not.toContain("invalid api key");
  });

  test("sin clave guardada no se llama a nadie", async () => {
    let llamadas = 0;
    const fallo = await decidirConJev({
      clave: "  ",
      estado: {},
      pregunta: PREGUNTAS.identidad.pregunta,
      buscar: (async () => {
        llamadas++;
        return respuestaGrabada(JEV_IDENTIDAD_SI);
      }) as unknown as typeof fetch,
    }).catch((error: unknown) => error);
    expect((fallo as ErrorJev).codigo).toBe("sin-clave");
    expect(llamadas).toBe(0);
  });

  test("una respuesta que no se entiende no se convierte en un veredicto", async () => {
    const fallo = await decidirConJev({
      clave: CLAVE,
      estado: {},
      pregunta: PREGUNTAS.identidad.pregunta,
      buscar: contesta({ model: "jev-1.13.0", answers: { coherencia: { type: "noul" } } }),
    }).catch((error: unknown) => error);
    expect((fallo as ErrorJev).codigo).toBe("respuesta-inesperada");
  });

  test("listar los modelos prueba la clave y no factura nada", async () => {
    expect(await modelosDeJev(CLAVE, contesta(JEV_MODELOS_200))).toContain("jev-1.13.0");
  });
});

describe("cobertura con la identidad comprobada", () => {
  const frontal = (
    origen: ReferenciaParaCobertura["origen"],
    identidad: ReferenciaParaCobertura["identidad"] = "sin_comprobar",
  ): ReferenciaParaCobertura => ({ vistaClave: "frontal", origen, identidad });

  test("en un personaje real una vista generada que pasa cubre su vista", () => {
    const cobertura = calcularCobertura("persona", [frontal("vista_generada", "pasa")]);
    expect(cobertura.faltan).not.toContain("frontal");
    expect(cobertura.vistas.find((v) => v.vista === "frontal")?.generadasVerificadas).toBe(1);
  });

  test("una vista generada sin comprobar, a revisar o rechazada no cubre", () => {
    for (const identidad of ["sin_comprobar", "revisar", "no_pasa"] as const) {
      const cobertura = calcularCobertura("persona", [frontal("vista_generada", identidad)]);
      expect(cobertura.faltan).toContain("frontal");
    }
  });

  test("en un personaje inventado su vista generada cubre sin comprobar nada", () => {
    const cobertura = calcularCobertura("persona", [frontal("vista_generada")], true);
    expect(cobertura.faltan).not.toContain("frontal");
  });

  test("una foto original cubre siempre: es ella la que define la cara", () => {
    const cobertura = calcularCobertura("persona", [frontal("foto_original")]);
    expect(cobertura.faltan).not.toContain("frontal");
  });
});
