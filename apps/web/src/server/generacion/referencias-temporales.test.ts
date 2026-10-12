import { expect, test } from "bun:test";
import type { FilaTrabajo } from "../db/esquema";
import { esEdicionConLugar, imagenesTemporalesDelTrabajo } from "./referencias-temporales";

const fila = {
  userId: "usuario",
  input: {
    referenciasTemporales: [{ medioId: crypto.randomUUID(), etiqueta: "terraza", uso: "lugar" }],
    primeraReferenciaTemporal: 4,
  },
} as unknown as FilaTrabajo;
test("un lugar mal formado devuelve un error de petición antes de consultar o pagar", () => {
  try {
    esEdicionConLugar([{ uso: "lugar", medioId: "invalid", etiqueta: "iglesia" }]);
  } catch (error) {
    expect((error as { estado: number }).estado).toBe(400);
    return;
  }
  throw new Error("Se aceptó una referencia inválida");
});
test("la cola no reasigna etiquetas si desaparece una referencia anterior", async () => {
  await expect(imagenesTemporalesDelTrabajo(fila, 10, 2)).rejects.toThrow("etiquetas desplazadas");
});
test("un modelo de reserva con menos cupo no elimina imágenes silenciosamente", async () => {
  await expect(imagenesTemporalesDelTrabajo(fila, 3, 3)).rejects.toThrow("necesita 4");
});
test("la edición del lugar se bloquea si desaparece una foto de identidad", async () => {
  const edicion = {
    ...fila,
    input: {
      ...fila.input,
      modoReferencias: "lugar_base",
      primeraReferenciaTemporal: 1,
      cantidadReferenciasPrevias: 3,
    },
  } as FilaTrabajo;
  await expect(imagenesTemporalesDelTrabajo(edicion, 10, 2)).rejects.toThrow("identidad han cambiado");
});
