import { describe, expect, test } from "bun:test";
import type { Hechos, HechosProducto } from "./contrato";
import { evaluar } from "./motor";

/**
 * El aviso de marca sale con marca declarada **y sin responder** (el lado seguro), cada uno con su motivo, y no sale
 * con un «no» explícito.
 */
const producto = (marcaVisible: boolean | null): HechosProducto => ({
  nombre: "Botella Ondina",
  sinFotos: false,
  referenciasNoCaben: false,
  sinHuecoDeReferencia: false,
  modelosConFoto: [],
  pocoFiable: false,
  nombreAccion: "",
  identidadRegistradaPerdida: false,
  marcaVisible,
});

const motivoDeMarca = (marcaVisible: boolean | null) =>
  evaluar({
    tipo: "fotograma",
    parametros: { exigirCoberturaVistas: false, exigirPrecioFresco: false, maximoAvisos: 3 },
    producto: producto(marcaVisible),
  } as Hechos).frenos.find((f) => f.regla === "producto-con-marca")?.motivo;

describe("aviso de marca según la respuesta", () => {
  test("con marca declarada lo dice así", () => {
    expect(motivoDeMarca(true)).toContain("Has declarado que en «Botella Ondina» se ve una marca");
  });

  test("sin responder se trata como con marca y se dice que falta responder", () => {
    expect(motivoDeMarca(null)).toContain("Todavía no has dicho si en «Botella Ondina» se ve una marca");
  });

  test("con un «no» explícito no hay aviso", () => {
    expect(motivoDeMarca(false)).toBeUndefined();
  });
});
