import { expect, test } from "bun:test";
import { ErrorDeTexto } from "./texto";

const caido = { proveedor: "NaN builders", modelo: "gemma4", codigo: "tiempo-agotado", cobro: "sin-cobro" } as const;

test("el mensaje dice en singular la entrada de pago que no se probó", () => {
  const mensaje = new ErrorDeTexto([caido], true, ["la entrada de KIE.ai"]).mensaje("No se ha podido");
  expect(mensaje).toContain("No se ha probado la entrada de KIE.ai porque es de pago");
});

test("y en plural cuando no se probaron varias", () => {
  const mensaje = new ErrorDeTexto([caido], true, ["la entrada de KIE.ai", "la entrada de Otro"]).mensaje(
    "No se ha podido",
  );
  expect(mensaje).toContain("No se han probado la entrada de KIE.ai ni la entrada de Otro porque son de pago");
  expect(mensaje).toContain("una de esas entradas de pago");
});

test("el fallo nombra el proveedor y no el modelo", () => {
  const mensaje = new ErrorDeTexto([caido], true).mensaje("No se ha podido");
  expect(mensaje).toContain("NaN builders ha tardado demasiado");
  expect(mensaje).not.toContain("gemma4");
});
