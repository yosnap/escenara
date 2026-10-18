import { describe, expect, test } from "bun:test";
import {
  BIBLIA_VACIA,
  type BibliaContinuidad,
  bloqueDeContinuidad,
  combinaLugarConIdentidad,
  conContinuidad,
  esPlanoBase,
  huellaDelPlano,
  leerBibliaContinuidad,
  planoCaducado,
  planosNecesarios,
  tieneBiblia,
} from "./continuidad";

const A = "personaje-a";
const B = "personaje-b";

describe("planos base que necesita un vídeo", () => {
  test("una persona: un solo plano, y sus dos escenas comparten el mismo", () => {
    const { planos, sinPlano } = planosNecesarios([
      { id: "e1", personajes: [A], conLugar: true },
      { id: "e2", personajes: [A], conLugar: true },
    ]);
    expect(planos).toEqual([{ personajeId: A, escenas: ["e1", "e2"] }]);
    expect(sinPlano).toEqual([]);
  });

  test("podcast en plano y contraplano: uno por personaje, en el orden en que aparecen", () => {
    const { planos } = planosNecesarios([
      { id: "e1", personajes: [A], conLugar: true },
      { id: "e2", personajes: [B], conLugar: true },
      { id: "e3", personajes: [A], conLugar: true },
    ]);
    expect(planos).toEqual([
      { personajeId: A, escenas: ["e1", "e3"] },
      { personajeId: B, escenas: ["e2"] },
    ]);
  });

  test("entrevista: los dos en plano, así que ninguna escena tiene plano base y se dice por qué", () => {
    const { planos, sinPlano } = planosNecesarios([
      { id: "e1", personajes: [A, B], conLugar: true },
      { id: "e2", personajes: [A, B], conLugar: true },
    ]);
    expect(planos).toEqual([]);
    expect(sinPlano.map((s) => s.motivo)).toEqual(["dos_personas", "dos_personas"]);
  });

  test("sin lugar no se pide ningún fotograma", () => {
    const { planos, sinPlano } = planosNecesarios([
      { id: "e1", personajes: [A], conLugar: false },
      { id: "e2", personajes: [A], conLugar: false },
    ]);
    expect(planos).toEqual([]);
    expect(sinPlano.every((s) => s.motivo === "sin_lugar")).toBe(true);
  });

  test("una escena sin nadie no pide plano", () => {
    expect(planosNecesarios([{ id: "e1", personajes: [], conLugar: true }]).sinPlano[0]?.motivo).toBe("sin_personaje");
  });
});

describe("la biblia guardada", () => {
  test("se lee campo a campo y descarta lo que no tiene forma", () => {
    const leida = leerBibliaContinuidad({
      lugar: "  A bright kitchen at noon  ",
      vestuario: { [A]: "Navy linen shirt", [B]: 42, "": "nada" },
      planos: [{ personajeId: A, trabajoId: "t1", medioId: null }, { personajeId: 3 }, null],
    });
    expect(leida.lugar).toBe("A bright kitchen at noon");
    expect(leida.vestuario).toEqual({ [A]: "Navy linen shirt" });
    expect(leida.planos).toEqual([{ personajeId: A, trabajoId: "t1", medioId: null, escenaId: null, huella: "" }]);
  });

  test("lo que no es un objeto es una biblia vacía", () => {
    expect(leerBibliaContinuidad(null)).toEqual(BIBLIA_VACIA);
    expect(leerBibliaContinuidad("texto")).toEqual(BIBLIA_VACIA);
    expect(tieneBiblia(BIBLIA_VACIA)).toBe(false);
  });

  test("un medio es plano base solo si está aprobado en algún plano", () => {
    const biblia: BibliaContinuidad = {
      ...BIBLIA_VACIA,
      planos: [{ personajeId: A, trabajoId: "t1", medioId: "m1", escenaId: "e1", huella: "h" }],
    };
    expect(esPlanoBase(biblia, "m1")).toBe(true);
    expect(esPlanoBase(biblia, "m2")).toBe(false);
    expect(esPlanoBase(biblia, null)).toBe(false);
  });
});

describe("continuidad en el prompt", () => {
  const biblia: BibliaContinuidad = {
    lugar: "A small radio studio, warm tungsten light",
    vestuario: { [A]: "Mustard knitted jumper and dark jeans", [B]: "White shirt, grey blazer" },
    planos: [],
  };

  test("repite literal el vestuario de quien sale y el lugar si la escena no tiene el suyo", () => {
    const bloque = bloqueDeContinuidad(biblia, [{ id: A, nombre: "Ana" }], false);
    expect(bloque).toContain("Ana wears exactly: Mustard knitted jumper and dark jeans.");
    expect(bloque).toContain("Setting and light: A small radio studio, warm tungsten light.");
    expect(bloque).not.toContain("White shirt");
  });

  test("con lugar elegido no repite el de la biblia, para no contradecirlo", () => {
    const bloque = bloqueDeContinuidad(
      biblia,
      [
        { id: A, nombre: "Ana" },
        { id: B, nombre: "Bea" },
      ],
      true,
    );
    expect(bloque).toContain("Bea wears exactly: White shirt, grey blazer.");
    expect(bloque).not.toContain("Setting");
  });

  test("sin biblia el prompt queda como estaba", () => {
    expect(bloqueDeContinuidad(BIBLIA_VACIA, [{ id: A, nombre: "Ana" }], false)).toBe("");
    expect(conContinuidad("Ana talks to camera.", "")).toBe("Ana talks to camera.");
    expect(conContinuidad("Ana talks.", "Continuity: x")).toBe("Ana talks.\nContinuity: x");
  });
});

describe("plano base junto a la identidad registrada", () => {
  test("el ajuste general combina cualquier fotograma aprobado", () => {
    expect(combinaLugarConIdentidad({ ajusteGeneral: true, ajusteVideoCompleto: false, esPlanoBase: false })).toBe(
      true,
    );
  });

  test("el de los vídeos completos solo combina su plano base", () => {
    expect(combinaLugarConIdentidad({ ajusteGeneral: false, ajusteVideoCompleto: true, esPlanoBase: true })).toBe(true);
    expect(combinaLugarConIdentidad({ ajusteGeneral: false, ajusteVideoCompleto: true, esPlanoBase: false })).toBe(
      false,
    );
  });

  test("con los dos apagados, como sale de fábrica, no combina nada", () => {
    expect(combinaLugarConIdentidad({ ajusteGeneral: false, ajusteVideoCompleto: false, esPlanoBase: true })).toBe(
      false,
    );
  });
});

describe("un plano base caduca si cambia con qué se generó", () => {
  const datos = {
    versionFichaId: "v1",
    lugarId: "l1",
    lugarVersion: 2,
    sitio: "junto a la ventana",
    vestuario: "Mustard knitted jumper",
    lugarBiblia: "A small radio studio",
  };
  const guardado = { trabajoId: "t1", huella: huellaDelPlano(datos) };

  test("con lo mismo de entonces sigue valiendo", () => {
    expect(planoCaducado(guardado, huellaDelPlano({ ...datos }))).toBe(false);
  });

  test("otra versión de la ficha, del lugar, otro sitio, otra ropa u otro lugar de la biblia lo caducan", () => {
    for (const cambio of [
      { versionFichaId: "v2" },
      { lugarVersion: 3 },
      { lugarId: "l2" },
      { sitio: "en la barra" },
      { vestuario: "Red raincoat" },
      { lugarBiblia: "A rooftop" },
    ]) {
      expect(planoCaducado(guardado, huellaDelPlano({ ...datos, ...cambio }))).toBe(true);
    }
  });

  test("un plano que nunca se pidió no caduca: no hay nada que retirar", () => {
    expect(planoCaducado({ trabajoId: null, huella: "" }, huellaDelPlano(datos))).toBe(false);
  });
});
