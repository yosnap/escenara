import { describe, expect, test } from "bun:test";
import type { RepartoVista } from "./reparto";
import {
  avisosDelReparto,
  detalleDeLaEstimacion,
  faltasDelReparto,
  fechaDelPrecio,
  formatoDisponible,
  frasesDeLoPedido,
  motivoFormatoApagado,
  repartoConsentido,
  textoDelTurno,
} from "./reparto-pantalla";

/**
 * Lo que la pantalla le cuenta al usuario antes de pagar: **quién sale, quién habla, a quién le falta su
 * consentimiento y cuántos clips se cobran**. Todo en castellano y sin una palabra del prompt.
 */

const miembro = (nombre: string, parcial: Partial<RepartoVista["miembros"][number]> = {}) => ({
  id: `m-${nombre}`,
  personajeId: `p-${nombre}`,
  nombre,
  inventado: false,
  papel: "hablante" as const,
  lado: "izquierda" as const,
  mirada: "camara" as const,
  orden: 1,
  ...parcial,
});

const reparto = (parcial: Partial<RepartoVista>): RepartoVista => ({
  escenaId: "escena-1",
  formato: "solo",
  grupoPodcast: null,
  miembros: [],
  turnos: [],
  mismaVoz: false,
  ...parcial,
});

describe("una escena de un personaje", () => {
  test("no previsualiza nada nuevo: la pantalla sigue siendo la de siempre", () => {
    expect(frasesDeLoPedido(reparto({ formato: "solo", miembros: [miembro("Elisa")] }))).toEqual([]);
  });
});

describe("dualcast", () => {
  const frases = frasesDeLoPedido(
    reparto({
      formato: "dualcast",
      miembros: [
        miembro("Elisa", { papel: "hablante", lado: "izquierda", orden: 1 }),
        miembro("Marcos", { papel: "acompanante", lado: "derecha", orden: 2 }),
      ],
    }),
  );

  test("dice quién está a cada lado del plano", () => {
    expect(frases[0]).toBe("Los dos en el mismo plano: Elisa a la izquierda y Marcos a la derecha.");
  });

  test("dice quién habla y qué hace el otro", () => {
    expect(frases[1]).toBe("Habla Elisa; Marcos escucha y reacciona sin hablar.");
  });

  test("un acompañante con turno también figura como hablante", () => {
    const conTurnos = frasesDeLoPedido(
      reparto({
        formato: "dualcast",
        miembros: [miembro("Elisa"), miembro("Marcos", { papel: "acompanante", lado: "derecha" })],
        turnos: [
          { id: "t1", orden: 1, personajeId: "p-Elisa", nombre: "Elisa", texto: "Hola.", direccion: "" },
          { id: "t2", orden: 2, personajeId: "p-Marcos", nombre: "Marcos", texto: "Hola.", direccion: "" },
        ],
      }),
    );
    expect(conTurnos[1]).toBe("Hablan Elisa y Marcos, por turnos.");
  });

  test("previsualiza el texto literal de cada turno", () => {
    const pedido = frasesDeLoPedido(
      reparto({
        formato: "dualcast",
        miembros: [miembro("Elisa"), miembro("Marcos", { orden: 2 })],
        turnos: [
          { id: "t1", orden: 1, personajeId: "p-Elisa", nombre: "Elisa", texto: "¿Vienes?", direccion: "con calma" },
        ],
      }),
    );
    expect(pedido).toContain("1. Elisa: «¿Vienes?» (con calma)");
  });
});

describe("podcast", () => {
  const frases = frasesDeLoPedido(
    reparto({
      formato: "podcast",
      miembros: [
        miembro("Elisa", { lado: "izquierda", mirada: "derecha", orden: 1 }),
        miembro("Marcos", { lado: "derecha", mirada: "izquierda", orden: 2 }),
      ],
      turnos: [
        { id: "t1", orden: 1, personajeId: "p-Elisa", nombre: "Elisa", texto: "Hola.", direccion: "en tono cercano" },
      ],
    }),
  );

  test("dice que son dos clips y que en ninguno sale el otro", () => {
    expect(frases[0]).toContain("Dos clips del mismo set");
    expect(frases[0]).toContain("en ninguno sale el otro");
  });

  test("cada clip dice su lado, su mirada cruzada y cuántos turnos le tocan", () => {
    expect(frases[1]).toBe(
      "Clip 1: Elisa, a la izquierda del plano, mirando hacia la derecha, donde estaría Marcos. Dice 1 turno.",
    );
    expect(frases[2]).toContain("No dice nada: solo escucha.");
  });

  test("un turno se lee literal y con su dirección vocal", () => {
    expect(
      textoDelTurno({ id: "t1", orden: 1, personajeId: "p", nombre: "Elisa", texto: "Hola.", direccion: "con calma" }),
    ).toBe("1. Elisa: «Hola.» (con calma)");
  });
});

describe("formatos apagados por quien administra", () => {
  const activos = { podcastActivo: false, dualcastActivo: true };

  test("un personaje siempre se puede, y el formato apagado dice quién lo enciende", () => {
    expect(formatoDisponible("solo", activos)).toBe(true);
    expect(formatoDisponible("dualcast", activos)).toBe(true);
    expect(formatoDisponible("podcast", activos)).toBe(false);
    expect(motivoFormatoApagado("podcast", activos)).toContain("Admin › Ajustes › Dos personajes");
    expect(motivoFormatoApagado("dualcast", activos)).toBeNull();
  });
});

describe("consentimiento de cada persona real", () => {
  const elisa = { nombre: "Elisa", inventado: false, impedimentos: [] };
  const personajes = [
    elisa,
    { nombre: "Marcos", inventado: false, impedimentos: ["Su consentimiento no está registrado."] },
  ];

  test("se dice quién falta y qué le falta, por su nombre", () => {
    expect(faltasDelReparto(personajes)).toEqual(["A «Marcos» le falta: Su consentimiento no está registrado."]);
    expect(repartoConsentido(personajes)).toBe(false);
    expect(repartoConsentido([elisa])).toBe(true);
  });
});

describe("el total y la fecha del precio", () => {
  test("un podcast cuenta dos clips y dice de cuándo es el precio", () => {
    expect(
      detalleDeLaEstimacion({
        formato: "podcast",
        clips: [
          { orden: 1, nombre: "Elisa", creditos: 66, turnos: 1, palabras: 4 },
          { orden: 2, nombre: "Marcos", creditos: 63, turnos: 1, palabras: 3 },
        ],
        creditos: 129,
        comprobado: "2026-09-29",
      }),
    ).toBe("2 clips (podcast: un clip por personaje), con el precio comprobado el 29/09/2026.");
  });

  test("un dualcast es un solo clip", () => {
    expect(
      detalleDeLaEstimacion({
        formato: "dualcast",
        clips: [{ orden: 1, nombre: "Elisa y Marcos", creditos: 66, turnos: 2, palabras: 8 }],
        creditos: 66,
        comprobado: "",
      }),
    ).toBe("1 clip (un solo plano con los dos).");
  });

  test("una fecha que no se sabe no se inventa", () => {
    expect(fechaDelPrecio("")).toBe("");
    expect(fechaDelPrecio("hace un rato")).toBe("");
  });
});

describe("avisos antes de confirmar el gasto", () => {
  test("misma voz, turnos ausentes y diálogo largo conservan las reglas que exige el servidor", () => {
    const avisos = avisosDelReparto(
      reparto({ formato: "dualcast", miembros: [miembro("Elisa"), miembro("Marcos")], mismaVoz: true }),
      { avisos: ["El diálogo se va a cortar a media frase."] },
    );
    expect(avisos.map((aviso) => aviso.regla)).toEqual([
      "reparto-misma-voz",
      "reparto-sin-turnos",
      "reparto-dialogo-largo",
    ]);
  });
});
