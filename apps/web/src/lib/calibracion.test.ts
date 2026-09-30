import { describe, expect, it } from "bun:test";
import {
  AVISO_SIN_DATOS,
  calibrar,
  type EjemploEtiquetado,
  MUESTRA_MINIMA_CALIBRACION,
  medirUmbral,
  particionDe,
} from "./calibracion";

const ej = (
  encaja: number,
  confianza: number,
  etiqueta: EjemploEtiquetado["etiqueta"],
  particion: EjemploEtiquetado["particion"],
): EjemploEtiquetado => ({ encaja, confianza, etiqueta, particion });

/**
 * Datos de ejemplo de una pregunta bien comportada: con confianza alta acierta siempre; con confianza baja deja pasar
 * lo que la persona rechaza. Un umbral de 0,8 es el que separa las dos cosas.
 */
function muestra(particion: EjemploEtiquetado["particion"], n: number): EjemploEtiquetado[] {
  const salida: EjemploEtiquetado[] = [];
  for (let i = 0; i < n; i++) {
    // Seguras y correctas: la mitad pasan y la persona acepta, la otra mitad no pasan y la persona rechaza.
    salida.push(i % 2 === 0 ? ej(0.9, 0.9, "acepta", particion) : ej(0.1, 0.92, "rechaza", particion));
    // Dudosas y equivocadas: dejan pasar lo que la persona rechazó.
    salida.push(ej(0.7, 0.6, "rechaza", particion));
  }
  return salida;
}

describe("partición determinista", () => {
  it("el mismo origen cae siempre en la misma partición", () => {
    const id = "6a0f2a8e-3b1c-4d5e-8f90-1a2b3c4d5e6f";
    expect(particionDe(id)).toBe(particionDe(id));
    expect(particionDe(`${id}`)).toBe(particionDe(id));
  });

  it("reparte las dos particiones en proporción cercana a 70/30", () => {
    const n = 2000;
    let calibracion = 0;
    for (let i = 0; i < n; i++) if (particionDe(crypto.randomUUID()) === "calibracion") calibracion++;
    expect(calibracion / n).toBeGreaterThan(0.62);
    expect(calibracion / n).toBeLessThan(0.78);
  });
});

describe("medir un umbral", () => {
  it("cuenta precisión, falsos permisos y bloqueos innecesarios solo entre las opiniones firmes", () => {
    const m = medirUmbral(
      [
        ej(0.9, 0.9, "acepta", "retenido"), // acierto
        ej(0.9, 0.9, "rechaza", "retenido"), // falso permiso
        ej(0.1, 0.9, "acepta", "retenido"), // bloqueo innecesario
        ej(0.1, 0.9, "rechaza", "retenido"), // acierto
        ej(0.9, 0.3, "rechaza", "retenido"), // no opina
      ],
      0.8,
    );
    expect(m).toEqual({
      umbral: 0.8,
      muestra: 5,
      firmes: 4,
      sinOpinion: 1,
      aciertos: 2,
      falsosPermisos: 1,
      bloqueosInnecesarios: 1,
      precision: 0.5,
      cobertura: 0.8,
    });
  });

  it("sin ninguna opinión firme, la precisión es nula y no un 0 % inventado", () => {
    expect(medirUmbral([ej(0.9, 0.2, "acepta", "retenido")], 0.9).precision).toBeNull();
  });
});

describe("calibrar", () => {
  it("elige el umbral con la partición de calibración y mide en la retenida", () => {
    const r = calibrar([...muestra("calibracion", 30), ...muestra("retenido", 15)]);
    expect(r.suficiente).toBe(true);
    // Por debajo de 0,65 entran las dudosas y los falsos permisos se disparan; 0,65 es el más bajo que cumple.
    expect(r.umbral).toBe(0.65);
    expect(r.enCalibracion?.falsosPermisos).toBe(0);
    expect(r.enRetenido?.muestra).toBe(30);
    expect(r.enRetenido?.precision).toBe(1);
    expect(r.enRetenido?.falsosPermisos).toBe(0);
    expect(r.enRetenido?.bloqueosInnecesarios).toBe(0);
  });

  it("lo retenido no influye en la elección: cambiarlo cambia la medida, nunca el umbral", () => {
    const calibracion = muestra("calibracion", 30);
    const buena = calibrar([...calibracion, ...muestra("retenido", 15)]);
    // Una partición retenida en la que el evaluador lo hace todo al revés.
    const alReves = muestra("retenido", 15).map((e) => ({
      ...e,
      etiqueta: e.etiqueta === "acepta" ? ("rechaza" as const) : ("acepta" as const),
    }));
    const mala = calibrar([...calibracion, ...alReves]);
    expect(mala.umbral).toBe(buena.umbral);
    expect(mala.enCalibracion).toEqual(buena.enCalibracion);
    expect(mala.enRetenido?.precision).toBe(0);
    expect(mala.enRetenido?.falsosPermisos).toBeGreaterThan(0);
    expect(mala.enRetenido?.bloqueosInnecesarios).toBeGreaterThan(0);
  });

  it("con muestra insuficiente no propone umbral y lo dice con el aviso de siempre", () => {
    const r = calibrar([...muestra("calibracion", 5), ...muestra("retenido", 30)]);
    expect(r.suficiente).toBe(false);
    expect(r.umbral).toBeNull();
    expect(r.enRetenido).toBeNull();
    expect(r.motivo).toContain(AVISO_SIN_DATOS);
    expect(r.motivo).toContain(`${MUESTRA_MINIMA_CALIBRACION}`);
  });

  it("sin muestra retenida suficiente tampoco propone nada, aunque la de calibración sobre", () => {
    const r = calibrar([...muestra("calibracion", 50), ...muestra("retenido", 2)]);
    expect(r.umbral).toBeNull();
    expect(r.suficiente).toBe(false);
  });

  it("si ningún umbral deja los falsos permisos a raya, no se inventa uno", () => {
    // Todas firmes y todas dejando pasar lo rechazado.
    const malas = (p: EjemploEtiquetado["particion"]) => Array.from({ length: 30 }, () => ej(0.9, 0.99, "rechaza", p));
    const r = calibrar([...malas("calibracion"), ...malas("retenido")]);
    expect(r.suficiente).toBe(true);
    expect(r.umbral).toBeNull();
    expect(r.motivo).toContain("No se propone ninguno");
  });
});
