import { describe, expect, test } from "bun:test";
import type { HechosModelo, HechosProducto } from "./contrato";
import { motivoReferenciasNoCaben } from "./motivos-producto";

const modelo = (maximoReferencias: number): HechosModelo => ({
  nombre: "Gemini Omni 1.1 Flash",
  maximoReferencias,
  precioComprobado: "2026-09-29",
  precioCaducado: false,
  costeAcotado: true,
  motivoSinAcotar: "",
});

const producto = (referencias?: HechosProducto["referencias"]): HechosProducto => ({
  nombre: "Caja Huerta Valenciana",
  sinFotos: false,
  referenciasNoCaben: true,
  ...(referencias ? { referencias } : {}),
  sinHuecoDeReferencia: false,
  modelosConFoto: [],
  pocoFiable: false,
  nombreAccion: "",
  identidadRegistradaPerdida: false,
  marcaVisible: false,
});

describe("motivo del aviso de referencias que no caben", () => {
  test("dice cuántas fotos se envían de cada una y cuántas del producto se quedan fuera", () => {
    expect(
      motivoReferenciasNoCaben(modelo(7), producto({ fotosPersonaje: 6, fotosProducto: 5, personaje: 4, producto: 3 })),
    ).toBe(
      "Gemini Omni 1.1 Flash admite 7 referencias: se envían 4 del personaje y 3 de «Caja Huerta Valenciana»; 2 fotos del producto y 2 del personaje se quedan fuera. Lo que sobra puede salir distinto.",
    );
  });

  test("solo nombra lo que se queda fuera", () => {
    const texto = motivoReferenciasNoCaben(
      modelo(7),
      producto({ fotosPersonaje: 4, fotosProducto: 4, personaje: 4, producto: 3 }),
    );
    expect(texto).toBe(
      "Gemini Omni 1.1 Flash admite 7 referencias: se envían 4 del personaje y 3 de «Caja Huerta Valenciana»; 1 foto del producto se queda fuera. Lo que sobra puede salir distinto.",
    );
  });

  test("sin cifras, conserva el aviso general y usa el singular con un solo hueco", () => {
    const texto = motivoReferenciasNoCaben(modelo(1), producto());
    expect(texto).toContain("admite 1 referencia,");
    expect(texto).toContain("algunas se quedan fuera");
  });
});
