import { describe, expect, test } from "bun:test";
import type { EvaluacionVista } from "./controles";
import {
  FALTA_AVISO_GASTO_IMAGEN,
  FALTA_DERECHOS_IMAGEN,
  faltasDelEncargo,
  SALDO_NO_LLEGA,
  tipoDeLoPendiente,
} from "./encargo-de-imagen";

const CONTROLES: EvaluacionVista = {
  estado: "revision",
  reglasVersion: "r1",
  comprobaciones: [
    {
      regla: "marca-ajena",
      estado: "ajustes",
      motivo: "Se ve una marca ajena.",
      accion: "Confírmalo si es tuya.",
      enlace: null,
      confirmable: true,
    },
    {
      regla: "sin-clave",
      estado: "revision",
      motivo: "Falta tu clave de KIE.",
      accion: "Añádela en tu cuenta.",
      enlace: null,
      confirmable: false,
    },
  ],
} as EvaluacionVista;

const base = {
  estimacion: { superaUmbral: false, alcanza: true },
  controles: null,
  confirmados: [],
  derechos: true,
  avisoAceptado: false,
};

describe("qué falta para encargar una imagen", () => {
  test("al abrir, la casilla de derechos y el aviso de gasto son pasos pendientes, no bloqueos", () => {
    const faltas = faltasDelEncargo({ ...base, derechos: false, estimacion: { superaUmbral: true, alcanza: true } });
    expect(faltas.pendientes).toEqual([FALTA_DERECHOS_IMAGEN, FALTA_AVISO_GASTO_IMAGEN]);
    expect(faltas.impide).toEqual([]);
  });

  test("un saldo que no llega impide desde el principio y dice qué hacer", () => {
    const faltas = faltasDelEncargo({ ...base, estimacion: { superaUmbral: false, alcanza: false } });
    expect(faltas.impide).toEqual([SALDO_NO_LLEGA]);
    expect(SALDO_NO_LLEGA).toContain("no se ha cobrado nada");
  });

  test("un aviso confirmable es pendiente; un freno sin salida impide", () => {
    const faltas = faltasDelEncargo({ ...base, controles: CONTROLES });
    expect(faltas.pendientes).toEqual(["Falta confirmar el aviso: Se ve una marca ajena."]);
    expect(faltas.impide).toEqual(["Falta tu clave de KIE. Añádela en tu cuenta."]);
    expect(faltasDelEncargo({ ...base, controles: CONTROLES, confirmados: ["marca-ajena"] }).pendientes).toEqual([]);
  });

  test("con todo hecho no falta nada", () => {
    expect(faltasDelEncargo(base)).toEqual({ pendientes: [], impide: [] });
  });

  test("lo pendiente solo se vuelve bloqueo al intentar encargar sin ello", () => {
    expect(tipoDeLoPendiente(false)).toBe("pendiente");
    expect(tipoDeLoPendiente(true)).toBe("bloqueo");
  });
});
