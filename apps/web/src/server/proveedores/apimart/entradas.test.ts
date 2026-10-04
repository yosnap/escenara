import { describe, expect, test } from "bun:test";
import { type ModeloVista, PARAMETROS_VACIOS } from "@/lib/catalogo";
import type { ContextoEntrada } from "../contrato";
import { entradaDeModelo, tieneEntrada } from "./entradas";

/**
 * Ningún test llama a APIMart: cada llamada de verdad gasta saldo del usuario. Se comprueba la entrada que
 * se habría enviado (los campos exactos, medidos en el spike del 2026-10-04).
 */

function modelo(id: string, ajustes: Partial<ModeloVista> = {}): ModeloVista {
  return {
    id,
    proveedor: "apimart",
    nombreProveedor: "APIMart",
    modelo: id,
    nombre: id,
    capacidades: ["image_to_video"],
    estado: "validado",
    conVoz: false,
    unidad: "vídeo de 6 s",
    parametros: { ...PARAMETROS_VACIOS, ...ajustes.parametros },
    notas: "",
    evidencia: "",
    version: 1,
    predeterminado: false,
    precio: null,
    ...ajustes,
  } as ModeloVista;
}

const contexto = (ajustes: Partial<ContextoEntrada> = {}): ContextoEntrada => ({
  escena: "Una cafetería al amanecer, luz suave.",
  dialogo: "",
  urls: ["https://referencia.ejemplo/1.webp"],
  ...ajustes,
});

describe("entrada de APIMart: modelos medidos", () => {
  test("solo los cuatro modelos del spike tienen constructor", () => {
    expect(tieneEntrada("gemini-omni-1.1-flash-ext")).toBe(true);
    expect(tieneEntrada("veo3.1-lite-ext")).toBe(true);
    expect(tieneEntrada("MiniMax-Hailuo-2.3-Fast")).toBe(true);
    expect(tieneEntrada("gpt-image-2.5-flare")).toBe(true);
    expect(tieneEntrada("un-modelo-que-no-se-ha-medido")).toBe(false);
  });

  test("el omni lleva el diálogo en el prompt, sin traducir, y la duración del catálogo", () => {
    const m = modelo("gemini-omni-1.1-flash-ext", {
      conVoz: true,
      parametros: {
        ...PARAMETROS_VACIOS,
        duraciones: [6],
        proporciones: ["9:16"],
        resoluciones: ["720p"],
        maximoReferencias: 7,
      },
    });
    const entrada = entradaDeModelo(m, contexto({ dialogo: "Hola, ¿qué tal?" }));
    expect(entrada.model).toBe("gemini-omni-1.1-flash-ext");
    expect(entrada.image_urls).toEqual(["https://referencia.ejemplo/1.webp"]);
    expect(entrada.resolution).toBe("720p");
    expect(entrada.aspect_ratio).toBe("9:16");
    expect(entrada.duration).toBe(6);
    const prompt = entrada.prompt as string;
    // El diálogo exacto, entre comillas, y sin traducir: es lo que se va a oír.
    expect(prompt).toContain('saying in Spanish: "Hola, ¿qué tal?"');
    expect(prompt).toContain("Una cafetería al amanecer");
    // La prohibición de subtítulos siempre va presente en un clip.
    expect(prompt).toContain("No subtitles");
  });

  test("el omni sin diálogo no inventa nada que decir", () => {
    const m = modelo("gemini-omni-1.1-flash-ext", {
      conVoz: true,
      parametros: { ...PARAMETROS_VACIOS, duraciones: [6] },
    });
    const prompt = entradaDeModelo(m, contexto()).prompt as string;
    expect(prompt).not.toContain("saying in Spanish");
  });

  test("el veo usa la técnica de animación con labios sincronizados y solo existe a 8 s", () => {
    const m = modelo("veo3.1-lite-ext", {
      conVoz: true,
      parametros: { ...PARAMETROS_VACIOS, duraciones: [8], maximoReferencias: 1 },
    });
    const entrada = entradaDeModelo(m, contexto({ dialogo: "Buenos días." }));
    expect(entrada.model).toBe("veo3.1-lite-ext");
    expect(entrada.duration).toBe(8);
    expect(entrada.resolution).toBe("720p");
    expect(entrada.prompt).toContain("labios sincronizados");
    // El veo no admite otra duración: pedir 4s no la cambia.
    expect(entradaDeModelo(m, contexto({ segundos: 4 })).duration).toBe(8);
  });

  test("el hailuo manda un único first_frame_image y sin diálogo (no tiene voz)", () => {
    const m = modelo("MiniMax-Hailuo-2.3-Fast", {
      conVoz: false,
      parametros: {
        ...PARAMETROS_VACIOS,
        duraciones: [6],
        maximoReferencias: 1,
      },
    });
    const entrada = entradaDeModelo(m, contexto({ dialogo: "Esto no debe aparecer." }));
    expect(entrada.model).toBe("MiniMax-Hailuo-2.3-Fast");
    expect(entrada.first_frame_image).toBe("https://referencia.ejemplo/1.webp");
    expect(entrada.image_urls).toBeUndefined();
    expect(entrada.resolution).toBe("768p");
    // Un modelo sin voz nunca recibe el diálogo.
    expect(entrada.prompt).not.toContain("Esto no debe aparecer");
  });

  test("el gpt-image es una edición: una referencia, proporción y 1K, n=1", () => {
    const m = modelo("gpt-image-2.5-flare", {
      capacidades: ["image_edit"],
      parametros: { ...PARAMETROS_VACIOS, proporciones: ["9:16"], resoluciones: ["1K"], maximoReferencias: 1 },
    });
    const entrada = entradaDeModelo(m, contexto({ proporcion: "9:16" }));
    expect(entrada.model).toBe("gpt-image-2.5-flare");
    expect(entrada.image_urls).toEqual(["https://referencia.ejemplo/1.webp"]);
    expect(entrada.size).toBe("9:16");
    expect(entrada.resolution).toBe("1k");
    expect(entrada.n).toBe(1);
  });

  test("la proporción preferida solo se manda si el modelo la admite", () => {
    const m = modelo("veo3.1-lite-ext", {
      conVoz: true,
      parametros: { ...PARAMETROS_VACIOS, duraciones: [8], proporciones: ["9:16"], maximoReferencias: 1 },
    });
    // 16:9 no está en su lista: se queda con la del modelo (9:16).
    expect(entradaDeModelo(m, contexto({ proporcion: "16:9" })).aspect_ratio).toBe("9:16");
  });

  test("un modelo sin constructor no se le envía nada a ciegas", () => {
    const m = modelo("kling/v3-turbo");
    expect(() => entradaDeModelo(m, contexto())).toThrow(/no sabe montar/i);
  });
});
