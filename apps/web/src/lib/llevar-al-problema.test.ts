import { describe, expect, test } from "bun:test";
import {
  ALTO_FLECHA,
  type Problema,
  pasoDelProblema,
  planDeLlegada,
  posicionDeFlecha,
  primeroPendiente,
  sinRepetidos,
} from "./llevar-al-problema";

describe("a qué paso lleva cada problema", () => {
  test("manda el paso que dice el propio problema, aunque en la página esté en otro", () => {
    expect(pasoDelProblema({ paso: "coste" }, "escena")).toBe("coste");
  });

  test("si el problema no dice su paso, se usa el del panel que lo contiene", () => {
    expect(pasoDelProblema({}, "clip")).toBe("clip");
    expect(pasoDelProblema({ paso: "" }, "clip")).toBe("clip");
  });

  test("fuera de un flujo por pasos no hay paso: solo se desplaza", () => {
    expect(pasoDelProblema({}, null)).toBeNull();
  });
});

describe("plan de llegada", () => {
  const libre = () => false;

  test("otro paso libre: se cambia de paso", () => {
    expect(
      planDeLlegada(
        { id: "clip-derechos", texto: "x" },
        { pasoEnLaPagina: "clip", pasoActual: "escena", estaBloqueado: libre },
      ),
    ).toEqual({ accion: "cambiar-paso", paso: "clip" });
  });

  test("el paso en el que ya se está: solo se enfoca", () => {
    expect(
      planDeLlegada(
        { id: "descripcion", paso: "escena", texto: "x" },
        { pasoEnLaPagina: null, pasoActual: "escena", estaBloqueado: libre },
      ),
    ).toEqual({ accion: "enfocar" });
  });

  test("un paso bloqueado no se abre: se dice por qué", () => {
    expect(
      planDeLlegada(
        { id: "clip-derechos", paso: "clip", texto: "x" },
        { pasoEnLaPagina: null, pasoActual: "escena", estaBloqueado: (p) => p === "clip" },
      ),
    ).toEqual({ accion: "paso-bloqueado", paso: "clip" });
  });

  test("sin paso actual conocido se va al paso del problema", () => {
    expect(
      planDeLlegada(
        { id: "a", paso: "coste", texto: "x" },
        { pasoEnLaPagina: null, pasoActual: null, estaBloqueado: libre },
      ),
    ).toEqual({ accion: "cambiar-paso", paso: "coste" });
  });

  test("un problema sin sitio en la pantalla no lleva a ningún lado", () => {
    expect(
      planDeLlegada(
        { texto: "Sin clave de KIE." },
        { pasoEnLaPagina: null, pasoActual: "escena", estaBloqueado: libre },
      ),
    ).toEqual({ accion: "ninguna" });
  });
});

describe("primero pendiente y repetidos", () => {
  const lista: [Problema, Problema, Problema] = [
    { texto: "Bloqueo del servidor sin campo" },
    { id: "descripcion", paso: "escena", texto: "Falta describir la escena." },
    { id: "clip-derechos", paso: "clip", texto: "Falta confirmar que tienes derecho a usar la imagen." },
  ];

  test("el primero pendiente es el primero con sitio al que llevar", () => {
    expect(primeroPendiente(lista)?.id).toBe("descripcion");
    expect(primeroPendiente([{ texto: "solo texto" }])).toBeUndefined();
    expect(primeroPendiente([])).toBeUndefined();
  });

  test("el mismo campo con el mismo texto se cuenta una vez y se conserva el orden", () => {
    const repetida = [lista[1], lista[2], { ...lista[1] }];
    expect(sinRepetidos(repetida).map((p) => p.id)).toEqual(["descripcion", "clip-derechos"]);
  });
});

describe("posición de la flecha", () => {
  test("encima del bloque, en coordenadas de la página (no se mueve al desplazar)", () => {
    const pos = posicionDeFlecha({ top: 300, left: 100, width: 400 }, { x: 0, y: 1000 }, 1200);
    expect(pos.top).toBe(300 + 1000 - ALTO_FLECHA - 6);
    expect(pos.left).toBe(124);
  });

  test("no se sale por arriba ni por la derecha", () => {
    const pos = posicionDeFlecha({ top: 10, left: 1190, width: 400 }, { x: 0, y: 0 }, 1200);
    expect(pos.top).toBe(0);
    expect(pos.left).toBe(1200 - ALTO_FLECHA - 4);
  });
});
