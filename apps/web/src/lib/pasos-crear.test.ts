import { describe, expect, test } from "bun:test";
import { PROMPT_MINIMO } from "./generacion";
import {
  type DatosPasosCrear,
  IDS_PASOS_CREAR,
  MOTIVO_FOTOGRAMA_PARADO,
  numeroDePaso,
  pasoPredeterminadoDeCrear,
  pasosDeCrear,
} from "./pasos-crear";

const VACIO: DatosPasosCrear = {
  conFormato: true,
  calculandoFormato: false,
  origen: "fotograma",
  haySujeto: false,
  revisionConfirmada: false,
  caracteresDescripcion: 0,
  motivosPlantilla: 0,
  enviandoFotograma: false,
  fotograma: null,
  imagenDePartida: false,
  hayOrigenDelClip: false,
  clip: null,
  clipsAnteriores: 0,
};

const estados = (d: Partial<DatosPasosCrear>) =>
  Object.fromEntries(pasosDeCrear({ ...VACIO, ...d }).map((p) => [p.id, p.estado]));
const paso = (d: Partial<DatosPasosCrear>, id: string) => pasosDeCrear({ ...VACIO, ...d }).find((p) => p.id === id);

describe("pasos de «Crear» generando un fotograma", () => {
  test("siete pasos en el orden del flujo, empezando por el formato, todos con id conocido", () => {
    const pasos = pasosDeCrear(VACIO);
    expect(pasos.map((p) => p.id)).toEqual(["formato", "origen", "sujeto", "escena", "coste", "fotograma", "clip"]);
    for (const p of pasos) expect(IDS_PASOS_CREAR).toContain(p.id as never);
    expect(numeroDePaso(pasos, "coste")).toBe(5);
  });

  test("el formato: hecho con su elección y en curso mientras se pide el coste del trend", () => {
    expect(estados({}).formato).toBe("hecho");
    expect(estados({ calculandoFormato: true }).formato).toBe("en-curso");
  });

  test("se abre en el formato si hay trends y, sin ninguno, se salta al origen", () => {
    expect(pasoPredeterminadoDeCrear(true, true)).toBe("formato");
    expect(pasoPredeterminadoDeCrear(true, false)).toBe("origen");
    expect(pasoPredeterminadoDeCrear(false, true)).toBe("origen");
  });

  test("con menos de dos plantillas no hay formato que decidir: sale de la barra y los números corren", () => {
    const pasos = pasosDeCrear({ ...VACIO, conFormato: false });
    expect(pasos.map((p) => p.id)).toEqual(["origen", "sujeto", "escena", "coste", "fotograma", "clip"]);
    expect(numeroDePaso(pasos, "origen")).toBe(1);
    expect(pasosDeCrear({ ...VACIO, conFormato: false, origen: "imagen" }).map((p) => p.id)).toEqual([
      "origen",
      "imagen",
      "clip",
    ]);
  });

  test("con el fotograma fallido: el motivo dice la verdad y el coste vuelve a estar pendiente", () => {
    for (const parado of ["fallido", "cancelado", "desconocido"] as const) {
      const d = { caracteresDescripcion: 20, fotograma: parado };
      expect(paso(d, "clip")?.motivo).toBe(MOTIVO_FOTOGRAMA_PARADO);
      expect(paso(d, "clip")?.motivo).not.toContain("Espera");
      expect(estados(d).coste).toBe("pendiente");
    }
    expect(MOTIVO_FOTOGRAMA_PARADO).toContain("no ha salido");
  });

  test("al abrir: coste, resultado y clip bloqueados, cada uno con su motivo", () => {
    const pasos = pasosDeCrear(VACIO);
    for (const id of ["coste", "fotograma", "clip"]) {
      const p = pasos.find((x) => x.id === id);
      expect(p?.estado).toBe("bloqueado");
      expect(p?.motivo?.length).toBeGreaterThan(10);
    }
    expect(paso({}, "coste")?.motivo).toContain(String(PROMPT_MINIMO));
  });

  test("describir la escena desbloquea el coste, y sin personaje el sujeto cuenta como elegido", () => {
    expect(estados({ caracteresDescripcion: PROMPT_MINIMO })).toMatchObject({
      sujeto: "hecho",
      escena: "hecho",
      coste: "pendiente",
      fotograma: "bloqueado",
    });
  });

  test("una descripción a medias o con la plantilla incompleta está en curso", () => {
    expect(estados({ caracteresDescripcion: 3 }).escena).toBe("en-curso");
    expect(estados({ caracteresDescripcion: PROMPT_MINIMO, motivosPlantilla: 1 }).escena).toBe("en-curso");
  });

  test("con personaje o foto, el sujeto espera la revisión de las fotos", () => {
    expect(estados({ haySujeto: true }).sujeto).toBe("en-curso");
    expect(estados({ haySujeto: true, revisionConfirmada: true }).sujeto).toBe("hecho");
  });

  test("el coste está en curso mientras se envía y hecho al confirmarse", () => {
    expect(estados({ caracteresDescripcion: 20, enviandoFotograma: true }).coste).toBe("en-curso");
    expect(estados({ caracteresDescripcion: 20, fotograma: "en_cola" }).coste).toBe("hecho");
  });

  test("el resultado sigue al trabajo, y el clip espera al fotograma listo", () => {
    const enMarcha = { caracteresDescripcion: 20, fotograma: "en_curso" as const };
    expect(estados(enMarcha).fotograma).toBe("en-curso");
    expect(paso(enMarcha, "clip")?.motivo).toContain("Espera");
    const listo = { caracteresDescripcion: 20, fotograma: "listo" as const, hayOrigenDelClip: true };
    expect(estados(listo)).toMatchObject({ fotograma: "hecho", clip: "pendiente" });
    expect(estados({ ...enMarcha, fotograma: "fallido" }).fotograma).toBe("pendiente");
  });

  test("el clip: en curso mientras se genera, hecho al terminar o si ya hubo uno", () => {
    const base = { caracteresDescripcion: 20, fotograma: "listo" as const, hayOrigenDelClip: true };
    expect(estados({ ...base, clip: "en_cola" }).clip).toBe("en-curso");
    expect(estados({ ...base, clip: "listo" }).clip).toBe("hecho");
    expect(estados({ ...base, clipsAnteriores: 2 }).clip).toBe("hecho");
  });
});

describe("pasos de «Crear» con una imagen tuya", () => {
  test("solo formato, origen, imagen y clip: no hay fotograma que describir ni que pagar", () => {
    const pasos = pasosDeCrear({ ...VACIO, origen: "imagen" });
    expect(pasos.map((p) => p.id)).toEqual(["formato", "origen", "imagen", "clip"]);
    expect(pasos[3]?.estado).toBe("bloqueado");
    expect(pasos[3]?.motivo).toContain("imagen de partida");
    expect(numeroDePaso(pasos, "clip")).toBe(4);
  });

  test("elegir la imagen hace el paso y desbloquea el clip", () => {
    expect(estados({ origen: "imagen", imagenDePartida: true, hayOrigenDelClip: true })).toMatchObject({
      imagen: "hecho",
      clip: "pendiente",
    });
  });
});

describe("requisitos pendientes en la barra", () => {
  test("cada paso abrible lleva cuántos requisitos le faltan", () => {
    const pasos = pasosDeCrear({
      ...VACIO,
      caracteresDescripcion: PROMPT_MINIMO,
      pendientes: { sujeto: 2, escena: 1 },
    });
    expect(pasos.find((p) => p.id === "sujeto")?.pendientes).toBe(2);
    expect(pasos.find((p) => p.id === "escena")?.pendientes).toBe(1);
    expect(pasos.find((p) => p.id === "origen")?.pendientes).toBeUndefined();
  });

  test("un paso bloqueado no los cuenta: ya dice qué hay que hacer antes", () => {
    expect(paso({ pendientes: { clip: 3 } }, "clip")?.estado).toBe("bloqueado");
    expect(paso({ pendientes: { clip: 3 } }, "clip")?.pendientes).toBeUndefined();
  });

  test("sin pendientes o con cero, los pasos quedan como estaban", () => {
    expect(pasosDeCrear({ ...VACIO, pendientes: { escena: 0 } })).toEqual(pasosDeCrear(VACIO));
  });
});
