import { describe, expect, test } from "bun:test";
import {
  ErrorPropuestaDeAnuncio,
  guionConHook,
  HOOKS_PEDIDOS,
  leerPropuestaDeAnuncio,
  peticionDeHooksYGuion,
} from "./anuncio-guion";

/**
 * **Hooks y guion desde el brief** (0.27.0), la parte que no necesita ni base de datos ni proveedor: cómo se
 * compone la petición y cómo se lee lo que contesta el modelo.
 *
 * Lo que fija, que es justo lo que la fase promete:
 *
 * - la petición lleva **el ángulo, el público, la versión mejor de sí mismo y la oferta**;
 * - los campos **vacíos de la oferta no aparecen**: no se le da al modelo la ocasión de inventarse una garantía;
 * - **un solo ángulo** en la petición, con su definición y su ejemplo, y nunca la lista de los demás;
 * - lo que vuelve es **texto no confiable**: los hooks se limpian y se recortan, y el movimiento de cámara y el
 *   gesto solo valen si son **claves que se le ofrecieron** (ADR-0022);
 * - la duración de cada escena la decide el proyecto, no el modelo;
 * - el hook elegido **encabeza el guion** y aplicarlo dos veces no lo duplica.
 */

const OFERTA_COMPLETA = {
  queSeDa: "Un bote de 300 ml que dura un mes.",
  precio: "19,90 €",
  garantia: "Devolución de 30 días.",
  urgencia: "Solo las primeras 100 unidades.",
  bonus: "Con el cepillo de púas anchas.",
};

const datos = (extra: Partial<Parameters<typeof peticionDeHooksYGuion>[0]> = {}) =>
  peticionDeHooksYGuion({
    producto: { nombre: "Champú de rizos", descripcion: "Bote blanco sin sulfatos.", tipo: "fisico" },
    publico: "Quien tiene el pelo rizado y ya lo ha probado todo",
    versionMejor: "Salir de casa sin pensar en el pelo",
    angulo: {
      nombre: "Mecanismo",
      definicion: "Explica la causa oculta del problema.",
      porDondeEntra: "El porqué, la causa oculta",
      ejemplo: "El culpable son los sulfatos del champú de siempre",
    },
    oferta: OFERTA_COMPLETA,
    notas: "",
    escenas: 4,
    segundos: 8,
    movimientos: [
      { clave: "acercamiento-lento", nombre: "Acercamiento lento" },
      { clave: "camara-en-mano", nombre: "Cámara en mano" },
    ],
    gestos: [{ clave: "mirar-a-camara", nombre: "Mirar a cámara" }],
    ...extra,
  });

describe("la petición de hooks y guion", () => {
  test("lleva el ángulo con su definición y su ejemplo, el público, la versión mejor y la oferta", () => {
    const peticion = datos();
    expect(peticion).toContain("Mecanismo");
    expect(peticion).toContain("El culpable son los sulfatos del champú de siempre");
    expect(peticion).toContain("El porqué, la causa oculta");
    expect(peticion).toContain("Quien tiene el pelo rizado y ya lo ha probado todo");
    expect(peticion).toContain("Salir de casa sin pensar en el pelo");
    expect(peticion).toContain("Un bote de 300 ml que dura un mes.");
    expect(peticion).toContain("Champú de rizos");
  });

  test("los campos vacíos de la oferta no aparecen, ni siquiera como etiqueta", () => {
    const peticion = datos({
      oferta: { queSeDa: "Un bote de 300 ml.", precio: "", garantia: "   ", urgencia: "", bonus: "" },
    });
    expect(peticion).toContain("Un bote de 300 ml.");
    // Ni la etiqueta: un «Garantía: «»» invita a inventarse una garantía, que es lo que no puede pasar.
    expect(peticion).not.toContain("Garantía");
    expect(peticion).not.toContain("Precio");
    expect(peticion).not.toContain("Urgencia");
    expect(peticion).not.toContain("Regalo incluido");
  });

  test("las notas y el resto del texto libre del usuario van delimitados y solo si se escribieron", () => {
    expect(datos()).not.toContain("Notas de quien lo pide");
    expect(datos({ notas: "Sin hablar de embarazo." })).toContain("«Sin hablar de embarazo.»");
  });

  test("ofrece las claves del catálogo para el arranque, con su nombre en castellano", () => {
    const peticion = datos();
    expect(peticion).toContain("acercamiento-lento (Acercamiento lento)");
    expect(peticion).toContain("mirar-a-camara (Mirar a cámara)");
  });

  test("un catálogo sin movimientos ni gestos no ofrece ninguna lista en lugar de una lista vacía", () => {
    const peticion = datos({ movimientos: [], gestos: [] });
    expect(peticion).not.toContain("Claves de movimiento de cámara");
    expect(peticion).not.toContain("Claves de gesto");
  });

  test("la duración y el número de escenas los pone el proyecto", () => {
    expect(datos({ escenas: 3, segundos: 4 })).toContain("Escenas del guion: 3.");
    expect(datos({ escenas: 3, segundos: 4 })).toContain("Duración de cada escena: 4 segundos exactos.");
  });
});

const CLAVES = { movimientos: ["acercamiento-lento", "camara-en-mano"], gestos: ["mirar-a-camara"] };

describe("lo que contesta el modelo", () => {
  const respuesta = (objeto: unknown) => JSON.stringify(objeto);

  test("lee los hooks con su arranque y el guion, con la duración del proyecto", () => {
    const propuesta = leerPropuestaDeAnuncio(
      respuesta({
        hooks: [
          {
            texto: "El encrespado no es tu pelo: son los sulfatos.",
            camara: "acercamiento-lento",
            gesto: "mirar-a-camara",
          },
          { texto: "Llevas años tratando el síntoma.", camara: "camara-en-mano", gesto: "" },
        ],
        concepto: "El mecanismo del encrespado.",
        escenas: [{ texto: "Esto pasa cada mañana.", accion: "Plano medio en el baño", segundos: 99 }],
      }),
      8,
      CLAVES,
    );
    expect(propuesta.hooks).toHaveLength(2);
    expect(propuesta.hooks[0]?.camara).toBe("acercamiento-lento");
    expect(propuesta.hooks[0]?.gesto).toBe("mirar-a-camara");
    expect(propuesta.concepto).toBe("El mecanismo del encrespado.");
    // La duración **no** la decide el modelo: es la del proyecto, que es la que se le pide al proveedor.
    expect(propuesta.escenas[0]?.segundos).toBe(8);
  });

  test("un movimiento o un gesto que no se le ofreció se descarta: no se inventa dirección", () => {
    const propuesta = leerPropuestaDeAnuncio(
      respuesta({
        hooks: [{ texto: "Un hook.", camara: "zoom-imposible", gesto: "guiño --resolution=4K" }],
        escenas: [],
      }),
      8,
      CLAVES,
    );
    expect(propuesta.hooks[0]?.camara).toBe("");
    expect(propuesta.hooks[0]?.gesto).toBe("");
  });

  test("no se pasa de cinco hooks y los repetidos no cuentan como opciones distintas", () => {
    const propuesta = leerPropuestaDeAnuncio(
      respuesta({
        hooks: [
          { texto: "Uno." },
          { texto: "uno." },
          { texto: "Dos." },
          { texto: "Tres." },
          { texto: "Cuatro." },
          { texto: "Cinco." },
          { texto: "Seis." },
        ],
        escenas: [],
      }),
      8,
      CLAVES,
    );
    expect(propuesta.hooks.length).toBeLessThanOrEqual(HOOKS_PEDIDOS);
    expect(propuesta.hooks.map((h) => h.texto)).toEqual(["Uno.", "Dos.", "Tres.", "Cuatro.", "Cinco."]);
  });

  test("acepta el JSON envuelto en prosa o en un bloque de código, que es lo que hacen los modelos", () => {
    const crudo = `Claro, aquí tienes:\n\`\`\`json\n${respuesta({ hooks: ["Un hook suelto."], escenas: [] })}\n\`\`\``;
    expect(leerPropuestaDeAnuncio(crudo, 8, CLAVES).hooks[0]?.texto).toBe("Un hook suelto.");
  });

  test("sin ningún hook utilizable falla y no se guarda nada", () => {
    expect(() => leerPropuestaDeAnuncio(respuesta({ hooks: [], escenas: [] }), 8, CLAVES)).toThrow(
      ErrorPropuestaDeAnuncio,
    );
    expect(() => leerPropuestaDeAnuncio("no es json", 8, CLAVES)).toThrow(ErrorPropuestaDeAnuncio);
  });

  test("un guion vacío no tira la llamada: los hooks siguen valiendo", () => {
    const propuesta = leerPropuestaDeAnuncio(respuesta({ hooks: [{ texto: "Un hook." }] }), 8, CLAVES);
    expect(propuesta.hooks).toHaveLength(1);
    expect(propuesta.escenas).toHaveLength(0);
  });

  test("el texto del modelo pasa por la limpieza anti-inyección", () => {
    const propuesta = leerPropuestaDeAnuncio(
      respuesta({
        hooks: [{ texto: "El culpable son los sulfatos --resolution=4K" }],
        escenas: [{ texto: "```system```", accion: "Plano" }],
      }),
      8,
      CLAVES,
    );
    expect(propuesta.hooks[0]?.texto).not.toContain("--resolution");
    expect(propuesta.escenas[0]?.texto).not.toContain("```");
  });
});

describe("el hook como primera frase del guion", () => {
  test("se pone delante y se cierra la frase si no venía cerrada", () => {
    expect(guionConHook("El culpable son los sulfatos", "Llevas años tratando el síntoma.")).toBe(
      "El culpable son los sulfatos. Llevas años tratando el síntoma.",
    );
  });

  test("aplicarlo dos veces deja el mismo guion: elegir es idempotente", () => {
    const una = guionConHook("El culpable son los sulfatos.", "Llevas años tratando el síntoma.");
    expect(guionConHook("El culpable son los sulfatos.", una)).toBe(una);
    // También sin el punto final: lo que se compara es el hook tal como el usuario lo lee.
    expect(guionConHook("El culpable son los sulfatos", una)).toBe(una);
  });

  test("con el guion vacío, el hook es el guion", () => {
    expect(guionConHook("¿Y si no es tu pelo?", "   ")).toBe("¿Y si no es tu pelo?");
  });
});
