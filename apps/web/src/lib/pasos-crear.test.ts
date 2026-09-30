import { describe, expect, test } from "bun:test";
import { PROMPT_MINIMO } from "./generacion";
import { type DatosPasosCrear, IDS_PASOS_CREAR, numeroDePaso, pasosDeCrear } from "./pasos-crear";

const VACIO: DatosPasosCrear = {
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
  test("seis pasos en el orden del flujo, todos con id conocido", () => {
    const pasos = pasosDeCrear(VACIO);
    expect(pasos.map((p) => p.id)).toEqual(["origen", "sujeto", "escena", "coste", "fotograma", "clip"]);
    for (const p of pasos) expect(IDS_PASOS_CREAR).toContain(p.id as never);
    expect(numeroDePaso(pasos, "coste")).toBe(4);
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
  test("solo origen, imagen y clip: no hay fotograma que describir ni que pagar", () => {
    const pasos = pasosDeCrear({ ...VACIO, origen: "imagen" });
    expect(pasos.map((p) => p.id)).toEqual(["origen", "imagen", "clip"]);
    expect(pasos[2]?.estado).toBe("bloqueado");
    expect(pasos[2]?.motivo).toContain("imagen de partida");
    expect(numeroDePaso(pasos, "clip")).toBe(3);
  });

  test("elegir la imagen hace el paso y desbloquea el clip", () => {
    expect(estados({ origen: "imagen", imagenDePartida: true, hayOrigenDelClip: true })).toMatchObject({
      imagen: "hecho",
      clip: "pendiente",
    });
  });
});
