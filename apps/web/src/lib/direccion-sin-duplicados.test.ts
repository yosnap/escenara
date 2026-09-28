import { describe, expect, test } from "bun:test";
import { aplicarDireccionGuardada, DIRECCION_CON_ACENTO_VACIA, type OpcionesDeDireccion } from "./direccion";
import { CATEGORIAS_DE_LA_DIRECCION, categoriasElegibles } from "./presets";

/**
 * Las dos reglas puras del parche 0.25.2:
 *
 * - **cada concepto se elige en un solo sitio**: lo que cubre la dirección no se vuelve a ofrecer en la
 *   botonera de la plantilla, y si no le queda nada, no queda panel;
 * - **una dirección guardada se aplica contra el catálogo de ahora**: una opción que quien administra haya
 *   desactivado desde entonces se ignora y se avisa, en lugar de enviarse como si nada.
 */

/** Variables tal como las declara la plantilla sembrada del clip (`clip-social`). */
const VARIABLES_DEL_CLIP = [
  { nombre: "duracion", tipo: "numero", categoria: "duracion" as const },
  { nombre: "plano", tipo: "enumerado", categoria: "plano" as const },
  { nombre: "angulo", tipo: "enumerado", categoria: "angulo" as const },
  { nombre: "camara", tipo: "enumerado", categoria: "camara" as const },
  { nombre: "registro", tipo: "enumerado", categoria: "registro-estetico" as const },
  { nombre: "personaje", tipo: "personaje" },
  { nombre: "escena", tipo: "texto" },
  { nombre: "microaccion", tipo: "enumerado", categoria: "microaccion" as const },
  { nombre: "estilo", tipo: "enumerado", categoria: "estilo" as const },
];

describe("la plantilla no repite lo que ya se elige en la dirección", () => {
  test("sin dirección a la vista, la plantilla ofrece todo lo que declara", () => {
    expect(categoriasElegibles(VARIABLES_DEL_CLIP)).toEqual([
      "estilo",
      "duracion",
      "plano",
      "angulo",
      "camara",
      "microaccion",
      "registro-estetico",
    ]);
  });

  test("con la dirección a la vista no le queda ninguna categoría, así que el panel desaparece", () => {
    expect(categoriasElegibles(VARIABLES_DEL_CLIP, CATEGORIAS_DE_LA_DIRECCION)).toEqual([]);
  });

  test("lo que la dirección no cubre se sigue eligiendo en la plantilla", () => {
    const conVestuario = [
      ...VARIABLES_DEL_CLIP,
      { nombre: "ropa", tipo: "enumerado", categoria: "vestuario" as const },
    ];
    expect(categoriasElegibles(conVestuario, CATEGORIAS_DE_LA_DIRECCION)).toEqual(["vestuario"]);
  });
});

describe("aplicar una dirección guardada", () => {
  const catalogo: OpcionesDeDireccion = {
    plano: [{ clave: "primer-plano", nombre: "Primer plano", descripcion: "" }],
    angulo: [{ clave: "tres-cuartos", nombre: "Tres cuartos", descripcion: "" }],
    optica: [],
    luz: [{ clave: "ventana", nombre: "Luz de ventana", descripcion: "" }],
    localizacion: [],
    camara: [{ clave: "push-in-ojos", nombre: "Acercarse a los ojos", descripcion: "" }],
    microaccion: [{ clave: "asentir", nombre: "Asentir", descripcion: "" }],
  };

  const guardada = {
    ...DIRECCION_CON_ACENTO_VACIA,
    plano: "primer-plano",
    camara: "push-in-ojos",
    microaccion: "asentir",
    momentoMicroaccion: "despues" as const,
    luz: "ventana",
    acento: "es_CO_bogota" as const,
    instruccionesExtra: "Que sostenga el bote con la etiqueta hacia la cámara.",
  };

  test("con el catálogo intacto se aplica entera y no avisa de nada", () => {
    const aplicada = aplicarDireccionGuardada(guardada, catalogo);
    expect(aplicada.direccion).toEqual(guardada);
    expect(aplicada.ignoradas).toEqual([]);
    expect(aplicada.aviso).toBe("");
  });

  test("una clave que ya no está en el catálogo se ignora y se dice cuál", () => {
    const sinCamara: OpcionesDeDireccion = { ...catalogo, camara: [], luz: [] };
    const aplicada = aplicarDireccionGuardada(guardada, sinCamara);
    expect(aplicada.direccion.camara).toBe("");
    expect(aplicada.direccion.luz).toBe("");
    // Lo que sigue existiendo no se pierde por el camino.
    expect(aplicada.direccion.plano).toBe("primer-plano");
    expect(aplicada.direccion.instruccionesExtra).toBe(guardada.instruccionesExtra);
    expect(aplicada.ignoradas).toEqual(["Movimiento de cámara", "Luz"]);
    expect(aplicada.aviso).toContain("ya no están en el catálogo");
  });
});
