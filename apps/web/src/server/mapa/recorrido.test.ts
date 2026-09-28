import { describe, expect, test } from "bun:test";
import { ErrorCompatible } from "../proveedores/compatible/cliente";
import { ErrorProveedor } from "../proveedores/contrato";
import type { EntradaResuelta } from "./mapa";
import { recorrerMapa } from "./recorrido";

const pago = (modelo: string): EntradaResuelta => ({
  proveedor: "kie",
  compatibleId: null,
  modelo,
  nombreProveedor: "KIE.ai",
  clave: "",
  compatible: null,
});

const cuota = (modelo: string): EntradaResuelta => ({
  proveedor: "compatible",
  compatibleId: "servicio-de-cuota",
  modelo,
  nombreProveedor: "NaN builders",
  clave: "",
  compatible: null,
});

describe("recorrido del mapa y regla de dinero", () => {
  test("tras un cobro dudoso nunca se vuelve a una entrada de pago, aunque falle una gratuita entre medias", async () => {
    const llamadas: string[] = [];
    const resultado = await recorrerMapa([pago("primero"), cuota("gratuito"), pago("segundo")], async (entrada) => {
      llamadas.push(entrada.modelo);
      // El primero agota el tiempo (no se sabe si cobró) y el gratuito también falla.
      if (entrada.modelo === "primero") throw new ErrorProveedor("kie", "tiempo-agotado");
      throw new ErrorCompatible("error-proveedor", "", 500);
    });
    expect(resultado.ok).toBe(false);
    // El segundo de pago no se llama: sería un posible segundo cargo por lo mismo.
    expect(llamadas).toEqual(["primero", "gratuito"]);
    expect(resultado.intentos[0]?.cobro).toBe("se-desconoce");
  });

  test("tras un cobro dudoso se sigue hacia la entrada gratuita, que es la excepción permitida", async () => {
    const resultado = await recorrerMapa([pago("primero"), cuota("gratuito")], async (entrada) => {
      if (entrada.modelo === "primero") throw new ErrorProveedor("kie", "tiempo-agotado");
      return "hecho";
    });
    expect(resultado.ok).toBe(true);
  });

  test("con un rechazo probado se puede seguir hacia otra entrada de pago", async () => {
    const llamadas: string[] = [];
    const resultado = await recorrerMapa([pago("primero"), pago("segundo")], async (entrada) => {
      llamadas.push(entrada.modelo);
      if (entrada.modelo === "primero") throw new ErrorProveedor("kie", "rechazada");
      return "hecho";
    });
    expect(resultado.ok).toBe(true);
    expect(llamadas).toEqual(["primero", "segundo"]);
  });
});
