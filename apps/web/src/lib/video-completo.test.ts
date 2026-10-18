import { describe, expect, test } from "bun:test";
import {
  bloquesDe,
  type CondicionesVideoCompleto,
  contarPalabras,
  costeDelGuion,
  ErrorDeBloque,
  ErrorTrozoInservible,
  escenasDeLosClips,
  leerBiblia,
  leerBloque,
  llamadasDelGuion,
  MOTIVO_LARGAS_CERRADAS,
  motivoDelProyecto,
  motivoDuracion,
  motivoTipo,
  opcionesDeVideoCompleto,
  palabrasMaximas,
  planDeClips,
  segundosDelPlan,
  trozoConReintento,
  ultimosTurnos,
} from "./video-completo";

/**
 * El vídeo completo desde una idea: cuántos clips, de cuántos segundos, cuántas palabras caben y cómo se lee lo
 * que escribe el modelo de texto. Todo es puro, así que aquí se fija sin base de datos ni proveedor.
 */

const condiciones = (cambios: Partial<CondicionesVideoCompleto> = {}): CondicionesVideoCompleto => ({
  modoVoz: "omni",
  tieneProtagonista: true,
  largasActivas: false,
  podcastActivo: true,
  dualcastActivo: true,
  escenasMaximas: 30,
  segundosMaximos: 300,
  ...cambios,
});

const frase = (palabras: number) => Array.from({ length: palabras }, (_, i) => `palabra${i}`).join(" ");

describe("plan de clips", () => {
  test("20 s de una persona y de entrevista son dos clips de 10 s", () => {
    for (const tipo of ["una_persona", "entrevista"] as const) {
      const plan = planDeClips(20, tipo);
      expect(plan.map((c) => c.segundos)).toEqual([10, 10]);
      expect(segundosDelPlan(plan)).toBe(20);
    }
    expect(planDeClips(20, "una_persona").map((c) => c.presentes)).toEqual([["A"], ["A"]]);
    expect(planDeClips(20, "entrevista").map((c) => c.presentes)).toEqual([
      ["A", "B"],
      ["A", "B"],
    ]);
  });

  test("20 s de podcast son 8 + 6 + 6 s con plano y contraplano (A, B, A)", () => {
    const plan = planDeClips(20, "podcast");
    expect(plan.map((c) => c.segundos)).toEqual([8, 6, 6]);
    expect(plan.map((c) => c.presentes)).toEqual([["A"], ["B"], ["A"]]);
  });

  test("≈ 1 min y ≈ 3 min son 8 y 23 clips de 8 s", () => {
    expect(planDeClips(60, "una_persona")).toHaveLength(8);
    expect(planDeClips(180, "entrevista")).toHaveLength(23);
    expect(planDeClips(180, "podcast").every((c) => c.segundos === 8)).toBe(true);
    expect(planDeClips(60, "podcast").map((c) => c.presentes[0])).toEqual(["A", "B", "A", "B", "A", "B", "A", "B"]);
  });

  test("las palabras máximas siguen 2,5 por segundo", () => {
    expect(palabrasMaximas(10)).toBe(25);
    expect(palabrasMaximas(8)).toBe(20);
    expect(palabrasMaximas(6)).toBe(15);
    expect(contarPalabras("  Hola, ¿qué tal?  — bien ")).toBe(4);
  });
});

describe("bloques y coste", () => {
  test("20 s es una sola llamada; 1 min, biblia + 1 bloque; 3 min, biblia + 3 bloques", () => {
    expect(llamadasDelGuion(20)).toBe(1);
    expect(llamadasDelGuion(60)).toBe(2);
    expect(llamadasDelGuion(180)).toBe(4);
    expect(bloquesDe(planDeClips(180, "una_persona")).map((b) => b.length)).toEqual([8, 8, 7]);
  });

  test("el coste confirmado es la suma de las llamadas más una de reserva, enseñada aparte", () => {
    expect(costeDelGuion(1.5, 20)).toEqual({ llamadas: 1, creditosLlamadas: 2, creditosReserva: 2, total: 4 });
    expect(costeDelGuion(3, 180)).toEqual({ llamadas: 4, creditosLlamadas: 12, creditosReserva: 3, total: 15 });
    // Un servicio por cuota (0 créditos) no cuesta nada, ni con la reserva.
    expect(costeDelGuion(0, 60).total).toBe(0);
  });
});

describe("qué se ofrece y qué se rechaza", () => {
  test("con el ajuste apagado solo se ofrece 20 s, y 1 y 3 min se rechazan con el motivo", () => {
    const opciones = opcionesDeVideoCompleto(condiciones());
    expect(opciones.duraciones.map((d) => d.duracion)).toEqual([20]);
    expect(motivoDuracion(60, "una_persona", condiciones())).toBe(MOTIVO_LARGAS_CERRADAS);
    expect(motivoDuracion(180, "podcast", condiciones())).toBe(MOTIVO_LARGAS_CERRADAS);
  });

  test("con el ajuste encendido se ofrecen y se aceptan las tres", () => {
    const encendido = condiciones({ largasActivas: true });
    expect(opcionesDeVideoCompleto(encendido).duraciones.map((d) => [d.duracion, d.motivo])).toEqual([
      [20, null],
      [60, null],
      [180, null],
    ]);
  });

  test("si los límites del admin no lo admiten, la opción sale desactivada con su motivo", () => {
    const pocasEscenas = condiciones({ largasActivas: true, escenasMaximas: 10 });
    expect(motivoDuracion(180, "una_persona", pocasEscenas)).toContain("23 escenas");
    expect(motivoDuracion(60, "una_persona", pocasEscenas)).toBeNull();
    const pocoMontaje = condiciones({ largasActivas: true, segundosMaximos: 120 });
    expect(motivoDuracion(180, "una_persona", pocoMontaje)).toContain("184 s");
  });

  test("hace falta el modo de voz registrada y un protagonista; los tipos siguen los formatos del admin", () => {
    expect(motivoDelProyecto(condiciones({ modoVoz: "clip" }))).toContain("Voz e identidad registradas");
    expect(motivoDelProyecto(condiciones({ tieneProtagonista: false }))).toContain("protagonista");
    expect(motivoDelProyecto(condiciones())).toBeNull();
    expect(motivoTipo("entrevista", condiciones({ dualcastActivo: false }))).toContain("dualcast");
    expect(motivoTipo("podcast", condiciones({ podcastActivo: false }))).toContain("podcast");
    expect(motivoTipo("una_persona", condiciones({ podcastActivo: false, dualcastActivo: false }))).toBeNull();
  });
});

describe("lectura de un trozo del guion", () => {
  const plan = planDeClips(20, "una_persona");
  const respuesta = (clips: unknown[]) => JSON.stringify({ concept: "Una rutina tranquila.", clips });

  test("un trozo correcto se lee con plano, acción y turnos limpios", () => {
    const { concepto, clips } = leerBloque(
      respuesta([
        { shot: "close_up", action: "Primer plano --seed=4 en la cocina", turns: [{ speaker: "A", text: "Hola." }] },
        { shot: "desconocido", action: "Plano medio", turns: [{ speaker: "A", text: "Y ahora, el café." }] },
      ]),
      plan,
    );
    expect(concepto).toBe("Una rutina tranquila.");
    expect(clips[0]?.plano).toBe("primer-plano");
    expect(clips[0]?.accion).not.toContain("--seed");
    expect(clips[1]?.plano).toBe("");
    expect(clips.map((c) => c.segundos)).toEqual([10, 10]);
  });

  test("el vestuario y el lugar que acompañan al guion se leen limpios y nunca obligan a repetirlo", () => {
    const clips = [
      { shot: "medium", action: "Plano medio", turns: [{ speaker: "A", text: "Hola." }] },
      { shot: "medium", action: "Plano medio", turns: [{ speaker: "A", text: "Adiós." }] },
    ];
    const con = leerBloque(
      JSON.stringify({
        concept: "x",
        clips,
        setting: "A sunny rooftop at 9 am --ar 16:9",
        characters: [{ speaker: "A", wardrobe: "Red raincoat" }, { speaker: "C", wardrobe: "nada" }, { speaker: "B" }],
      }),
      plan,
    );
    expect(con.continuidad.vestuario).toEqual({ A: "Red raincoat" });
    expect(con.continuidad.lugar).toContain("A sunny rooftop at 9 am");
    expect(con.continuidad.lugar).not.toContain("--ar");
    // Sin vestuario ni lugar, el trozo vale igual.
    expect(leerBloque(respuesta(clips), plan).continuidad).toEqual({ lugar: "", vestuario: {} });
  });

  test("un JSON cortado a mitad se marca como truncado", () => {
    const cortada = respuesta([{ shot: "medium", action: "x", turns: [{ speaker: "A", text: "Hola" }] }]).slice(0, 60);
    const fallo = (() => {
      try {
        leerBloque(cortada, plan);
      } catch (error) {
        return error;
      }
    })();
    expect(fallo).toBeInstanceOf(ErrorDeBloque);
    expect((fallo as ErrorDeBloque).causa).toBe("truncado");
    expect((fallo as ErrorDeBloque).causaParaElModelo).toContain("cut off");
  });

  test("un recuento de clips distinto del pedido se rechaza", () => {
    expect(() => leerBloque(respuesta([{ turns: [{ speaker: "A", text: "Solo uno." }] }]), plan)).toThrow(
      "hacían falta 2",
    );
  });

  test("un clip de 10 s con 35 palabras se rechaza por las palabras", () => {
    const largo = respuesta([
      { shot: "medium", action: "a", turns: [{ speaker: "A", text: frase(35) }] },
      { shot: "medium", action: "b", turns: [{ speaker: "A", text: "Corto." }] },
    ]);
    expect(() => leerBloque(largo, plan)).toThrow("35 palabras");
    // Con 25 justas sí cabe.
    const justo = respuesta([
      { action: "a", turns: [{ speaker: "A", text: frase(25) }] },
      { action: "b", turns: [{ speaker: "A", text: "Corto." }] },
    ]);
    expect(leerBloque(justo, plan).clips).toHaveLength(2);
  });

  test("en un plano de podcast solo habla quien sale", () => {
    const podcast = planDeClips(20, "podcast");
    const mal = JSON.stringify({
      clips: [
        { turns: [{ speaker: "A", text: "Hola." }] },
        { turns: [{ speaker: "A", text: "Soy yo otra vez." }] },
        { turns: [{ speaker: "A", text: "Adiós." }] },
      ],
    });
    expect(() => leerBloque(mal, podcast)).toThrow("no sale en ese plano");
  });

  test("los últimos turnos pasan al siguiente trozo", () => {
    const { clips } = leerBloque(
      JSON.stringify({
        clips: [
          {
            turns: [
              { speaker: "A", text: "Uno." },
              { speaker: "B", text: "Dos." },
            ],
          },
          { turns: [{ speaker: "A", text: "Tres." }] },
        ],
      }),
      planDeClips(20, "entrevista"),
    );
    expect(ultimosTurnos(clips)).toEqual([
      { hablante: "B", texto: "Dos." },
      { hablante: "A", texto: "Tres." },
    ]);
  });
});

describe("lectura de la biblia", () => {
  test("trae concepto y un objetivo por bloque", () => {
    const biblia = leerBiblia(
      JSON.stringify({
        concept: "Una mañana entera en la azotea.",
        characters: [{ speaker: "A", role: "Presentadora", wardrobe: "Jersey azul" }, { speaker: "Z" }],
        setting: "Azotea al amanecer",
        arc: ["Presentar", "Desarrollar", "Cerrar"],
      }),
      3,
    );
    expect(biblia.arco).toEqual(["Presentar", "Desarrollar", "Cerrar"]);
    expect(biblia.personajes).toEqual([{ hablante: "A", papel: "Presentadora", vestuario: "Jersey azul" }]);
  });

  test("un arco con otro número de partes se rechaza", () => {
    expect(() => leerBiblia(JSON.stringify({ concept: "x", arc: ["uno"] }), 3)).toThrow(ErrorDeBloque);
  });
});

describe("del guion a las escenas", () => {
  test("entrevista: dualcast con los dos y los turnos; podcast: planos solos con su personaje y grupo común", () => {
    const entrevista = leerBloque(
      JSON.stringify({
        clips: [
          {
            action: "Los dos en el sofá",
            turns: [
              { speaker: "A", text: "¿Qué tal?" },
              { speaker: "B", text: "Bien." },
            ],
          },
          { turns: [{ speaker: "B", text: "Adiós." }] },
        ],
      }),
      planDeClips(20, "entrevista"),
    ).clips;
    const escenas = escenasDeLosClips(entrevista, "entrevista", { A: "ana", B: "beto" }, null);
    expect(escenas[0]?.formato).toBe("dualcast");
    expect(escenas[0]?.reparto).toEqual(["ana", "beto"]);
    expect(escenas[0]?.turnos).toEqual([
      { personajeId: "ana", texto: "¿Qué tal?" },
      { personajeId: "beto", texto: "Bien." },
    ]);
    expect(escenas[0]?.texto).toBe("¿Qué tal? Bien.");

    const podcast = leerBloque(
      JSON.stringify({
        clips: [
          { turns: [{ speaker: "A", text: "Uno." }] },
          { turns: [{ speaker: "B", text: "Dos." }] },
          { turns: [{ speaker: "A", text: "Tres." }] },
        ],
      }),
      planDeClips(20, "podcast"),
    ).clips;
    const planos = escenasDeLosClips(podcast, "podcast", { A: "ana", B: "beto" }, "grupo");
    expect(planos.map((e) => [e.formato, e.reparto, e.grupoPodcast, e.segundos])).toEqual([
      ["solo", ["ana"], "grupo", 8],
      ["solo", ["beto"], "grupo", 6],
      ["solo", ["ana"], "grupo", 6],
    ]);
    expect(planos.every((e) => e.turnos.length === 0)).toBe(true);
  });
});

describe("repetir un trozo cortado", () => {
  const plan = planDeClips(20, "una_persona");
  const buena = JSON.stringify({
    clips: [{ turns: [{ speaker: "A", text: "Hola." }] }, { turns: [{ speaker: "A", text: "Adiós." }] }],
  });
  const cortada = buena.slice(0, 40);

  test("un JSON cortado se repite una sola vez, con la causa, y gasta la reserva", async () => {
    const pedidas: (string | undefined)[] = [];
    const respuestas = [cortada, buena];
    const reserva = { quedan: 1 };
    const { valor, intento } = await trozoConReintento({
      reserva,
      pedir: async (_intento, causa) => {
        pedidas.push(causa);
        return { texto: respuestas.shift() ?? "" };
      },
      leer: (texto) => leerBloque(texto, plan),
    });
    expect(valor.clips).toHaveLength(2);
    expect(intento).toBe(1);
    expect(pedidas).toHaveLength(2);
    expect(pedidas[0]).toBeUndefined();
    expect(pedidas[1]).toContain("cut off");
    expect(reserva.quedan).toBe(0);
  });

  test("si vuelve a llegar cortado, no se repite más y se dice que ya se repitió", async () => {
    let llamadas = 0;
    const fallo = await trozoConReintento({
      reserva: { quedan: 1 },
      pedir: async () => {
        llamadas++;
        return { texto: cortada };
      },
      leer: (texto) => leerBloque(texto, plan),
    }).catch((e: unknown) => e);
    expect(fallo).toBeInstanceOf(ErrorTrozoInservible);
    expect((fallo as ErrorTrozoInservible<unknown>).repetido).toBe(true);
    expect(llamadas).toBe(2);
  });

  test("sin reserva no se repite: el gasto nunca pasa de lo confirmado", async () => {
    let llamadas = 0;
    const fallo = await trozoConReintento({
      reserva: { quedan: 0 },
      pedir: async () => {
        llamadas++;
        return { texto: cortada };
      },
      leer: (texto) => leerBloque(texto, plan),
    }).catch((e: unknown) => e);
    expect((fallo as ErrorTrozoInservible<unknown>).repetido).toBe(false);
    expect(llamadas).toBe(1);
  });

  test("un fallo del proveedor no se repite aquí: sale tal cual", async () => {
    const fallo = await trozoConReintento({
      reserva: { quedan: 1 },
      pedir: async () => {
        throw new Error("sin conexión");
      },
      leer: (texto) => leerBloque(texto, plan),
    }).catch((e: unknown) => e);
    expect((fallo as Error).message).toBe("sin conexión");
  });
});
