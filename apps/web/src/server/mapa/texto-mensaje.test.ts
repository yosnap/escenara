import { expect, test } from "bun:test";
import { ErrorDeTexto } from "./texto";

const caido = { proveedor: "NaN builders", modelo: "gemma4", codigo: "tiempo-agotado", cobro: "sin-cobro" } as const;

test("el mensaje dice en singular la entrada de pago que no se probó", () => {
  const mensaje = new ErrorDeTexto([caido], true, ["KIE.ai (gpt-5-6-sol)"]).mensaje("No se ha podido");
  expect(mensaje).toContain("No se ha probado KIE.ai (gpt-5-6-sol) porque es de pago");
});

test("y en plural cuando no se probaron varias", () => {
  const mensaje = new ErrorDeTexto([caido], true, ["KIE.ai (gpt-5-6-sol)", "Otro (modelo-caro)"]).mensaje(
    "No se ha podido",
  );
  expect(mensaje).toContain("No se han probado KIE.ai (gpt-5-6-sol) ni Otro (modelo-caro) porque son de pago");
  expect(mensaje).toContain("una de esas entradas de pago");
});
