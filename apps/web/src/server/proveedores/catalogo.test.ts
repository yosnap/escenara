import { describe, expect, test } from "bun:test";
import {
  EVIDENCIA_MINIMA,
  esCapacidad,
  esEstadoModelo,
  esIdentificadorDeModelo,
  esSeleccionable,
  type ModeloVista,
  precioCaducado,
  recortarModelo,
  resumenParametros,
} from "@/lib/catalogo";
import { AJUSTES_POR_DEFECTO } from "../ajustes";
import { parametrosDeTexto, textoDeParametros } from "./catalogo";
import semilla from "./catalogo.json";
import { tieneEntrada } from "./kie/entradas";

/**
 * Catálogo sin base de datos: validación de los parámetros guardados, caducidad de los precios y coherencia
 * de la semilla versionada. La semilla es lo que se ejecuta en cada instalación, así que un error aquí
 * (un modelo sin precio, un estado inventado, un modelo que nadie sabe cómo enviar) se ve al instante.
 */

describe("parámetros de un modelo", () => {
  test("se leen y se escriben sin perder nada", () => {
    const parametros = {
      duraciones: [4, 6, 8],
      proporciones: ["9:16"],
      resoluciones: ["720p", "1080p"],
      formatosReferencia: ["image/png"],
      maximoReferencias: 2,
    };
    expect(parametrosDeTexto(textoDeParametros(parametros))).toEqual(parametros);
  });

  test("lo que no se entiende se descarta: nunca se supone que admite cualquier valor", () => {
    const sucio = parametrosDeTexto(
      '{"duraciones":[4,"seis",-1],"proporciones":["9:16",7,""],"resoluciones":null,"formatosReferencia":"png","maximoReferencias":0}',
    );
    expect(sucio).toEqual({
      duraciones: [4],
      proporciones: ["9:16"],
      resoluciones: [],
      formatosReferencia: [],
      maximoReferencias: 0,
    });
  });

  test("un JSON roto se trata como «sin parámetros»", () => {
    expect(parametrosDeTexto("{no es json")).toEqual({
      duraciones: [],
      proporciones: [],
      resoluciones: [],
      formatosReferencia: [],
      maximoReferencias: 0,
    });
  });

  test("el resumen solo menciona lo que el modelo acepta de verdad", () => {
    const resumen = resumenParametros({
      duraciones: [6, 10],
      proporciones: [],
      resoluciones: ["768P"],
      formatosReferencia: ["image/jpeg", "image/png"],
      maximoReferencias: 1,
    });
    expect(resumen.join(" · ")).toBe("Duración: 6, 10 s · Resolución: 768P · Referencias: 1 imagen (JPEG, PNG)");
    expect(resumen.some((t) => t.startsWith("Proporción"))).toBe(false);
  });
});

describe("lo que puede ver quien genera", () => {
  const completo: ModeloVista = {
    id: "fila-uuid",
    proveedor: "kie",
    nombreProveedor: "KIE.ai",
    modelo: "veo3_lite",
    nombre: "Veo 3.1 Lite",
    capacidades: ["image_to_video"],
    estado: "validado",
    conVoz: true,
    unidad: "vídeo de 4 s",
    parametros: {
      duraciones: [4, 6],
      proporciones: ["9:16"],
      resoluciones: ["720p"],
      formatosReferencia: ["image/png"],
      maximoReferencias: 2,
    },
    notas: "nota interna del admin",
    evidencia: "evidencia interna del admin",
    version: 3,
    predeterminado: true,
    precio: {
      unidad: "vídeo de 4 s",
      creditos: 60,
      fuente: "fuente interna del admin",
      comprobado: "2026-09-27",
      sello: "kie:veo3_lite:vídeo de 4 s@v1",
      caducado: false,
    },
    actualizado: "2026-09-27T00:00:00.000Z",
  };

  test("el recorte solo lleva lo necesario para elegir y confirmar", () => {
    const recortado = recortarModelo(completo);
    expect(Object.keys(recortado).sort()).toEqual(
      // `maximoReferencias` lo añade 0.13.0: «Crear» necesita saber cuántas fotos del personaje se envían.
      ["conVoz", "creditos", "duraciones", "estado", "maximoReferencias", "modelo", "nombre", "unidad"].sort(),
    );
    expect(recortado).toMatchObject({ modelo: "veo3_lite", creditos: 60, conVoz: true, duraciones: [4, 6] });
  });

  test("nunca lleva datos internos del admin", () => {
    const texto = JSON.stringify(recortarModelo(completo));
    for (const interno of ["interna del admin", "fila-uuid", '"version"', '"sello"']) {
      expect(texto).not.toContain(interno);
    }
  });

  test("un modelo sin precio se recorta a cero créditos, no a un precio inventado", () => {
    expect(recortarModelo({ ...completo, precio: null }).creditos).toBe(0);
  });
});

describe("caducidad del precio", () => {
  const hoy = new Date("2026-09-27T12:00:00Z");

  test("un precio reciente no está caducado", () => {
    expect(precioCaducado("2026-09-01", hoy)).toBe(false);
  });

  test("pasados 90 días se avisa", () => {
    expect(precioCaducado("2026-06-01", hoy)).toBe(true);
  });

  test("una fecha ilegible se trata como caducada", () => {
    expect(precioCaducado("", hoy)).toBe(true);
  });
});

describe("identificador de modelo que llega del navegador", () => {
  test("se aceptan los que usan los proveedores de verdad", () => {
    for (const id of ["nano-banana-2-lite", "veo3_lite", "seedream/4.5-edit", "kling/v3-turbo-image-to-video"]) {
      expect(esIdentificadorDeModelo(id)).toBe(true);
    }
  });

  test("se rechaza lo que no es un identificador", () => {
    for (const id of ["", "'; drop table models; --", "modelo con espacios", "a".repeat(200), 7, null]) {
      expect(esIdentificadorDeModelo(id)).toBe(false);
    }
  });
});

interface ModeloSemilla {
  proveedor: string;
  modelo: string;
  capacidades: string[];
  estado: string;
  predeterminado: boolean;
  unidad: string;
  evidencia: string;
  precio: { creditos: number; fuente: string; comprobado: string } | null;
}

const MODELOS = semilla.modelos as ModeloSemilla[];

describe("semilla versionada del catálogo", () => {
  test("cada modelo declara un proveedor de la semilla", () => {
    const slugs = semilla.proveedores.map((p) => p.slug);
    expect(MODELOS.every((m) => slugs.includes(m.proveedor))).toBe(true);
  });

  test("las capacidades y los estados existen", () => {
    for (const m of MODELOS) {
      expect(esEstadoModelo(m.estado)).toBe(true);
      expect(m.capacidades.length).toBeGreaterThan(0);
      expect(m.capacidades.every(esCapacidad)).toBe(true);
    }
  });

  test("todo modelo que se puede elegir tiene precio con fuente y fecha", () => {
    for (const m of MODELOS.filter((x) => esEstadoModelo(x.estado) && esSeleccionable(x.estado))) {
      expect(m.precio).not.toBeNull();
      // Los servicios compatibles se pagan por cuota del plan: su precio por petición es 0 de verdad, no una falta.
      if (m.proveedor === "compatible") expect(m.precio?.creditos).toBe(0);
      else expect(m.precio?.creditos).toBeGreaterThan(0);
      expect(m.precio?.fuente.length).toBeGreaterThan(10);
      expect(m.precio?.comprobado).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  test("ningún precio sembrado pasa del tope por trabajo que trae la instalación", () => {
    // Si un modelo del catálogo costara más que `presupuestoTrabajo`, nadie podría generar con él nada más
    // instalar Escenara: el trabajo se rechazaría con un 402 sin que haya hecho nada raro.
    const tope = AJUSTES_POR_DEFECTO.presupuestoTrabajo;
    for (const m of MODELOS.filter((x) => x.precio !== null)) {
      expect(Math.ceil(m.precio?.creditos ?? 0)).toBeLessThanOrEqual(tope);
    }
  });

  test("solo se siembra como validado lo que trae evidencia", () => {
    for (const m of MODELOS.filter((x) => x.estado === "validado")) {
      expect(m.evidencia.length).toBeGreaterThanOrEqual(EVIDENCIA_MINIMA);
    }
  });

  test("hay exactamente un modelo por defecto para cada capacidad que lo tenga", () => {
    const porDefecto = MODELOS.filter((m) => m.predeterminado);
    for (const m of porDefecto) {
      const rivales = porDefecto.filter((otro) => otro.capacidades.some((c) => m.capacidades.includes(c)));
      expect(rivales).toHaveLength(1);
    }
    // Las dos capacidades que usa «Crear» tienen que tener opción por defecto.
    for (const capacidad of ["image_edit", "image_to_video"]) {
      expect(porDefecto.some((m) => m.capacidades.includes(capacidad))).toBe(true);
    }
  });

  test("de todo modelo de KIE que se puede elegir se sabe con qué parámetros pedirlo", () => {
    // Los de texto no pasan por `jobs/createTask` ni por el mapa de entradas: su endpoint es síncrono y su
    // petición la compone el asistente (`kie/texto.ts`).
    const sinEntrada = MODELOS.filter(
      (m) =>
        m.proveedor === "kie" &&
        !m.capacidades.includes("text_generation") &&
        esEstadoModelo(m.estado) &&
        esSeleccionable(m.estado) &&
        !tieneEntrada(m.modelo),
    );
    expect(sinEntrada.map((m) => m.modelo)).toEqual([]);
  });
});
