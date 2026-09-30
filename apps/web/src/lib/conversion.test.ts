import { describe, expect, test } from "bun:test";
import {
  columnasDeDireccion,
  declaracionesQueFaltan,
  duracionDelProyecto,
  estadoDeConversion,
  type HechosDelClip,
  motivoParaNoConvertir,
  segundosDelClip,
  techoInicial,
  tituloDelProyecto,
  urlDelProyectoConvertido,
} from "./conversion";
import { DIRECCION_CON_ACENTO_VACIA } from "./direccion";
import { TITULO_MAXIMO } from "./proyectos";

const clip = (parcial: Partial<HechosDelClip> = {}): HechosDelClip => ({
  tipo: "animacion",
  estado: "listo",
  tieneMedio: true,
  tieneImagenDePartida: true,
  proyecto: null,
  turnoDeConversacion: false,
  canto: false,
  personaje: "Lucía",
  motivosPersonaje: [],
  declaraciones: { derechosImagen: true, revisionDeFotos: true, derechoMarca: null },
  ...parcial,
});

describe("qué clip se puede convertir", () => {
  test("un clip terminado, con su archivo y sus declaraciones, se puede", () => {
    expect(motivoParaNoConvertir(clip())).toBeNull();
    expect(estadoDeConversion(clip(), ["aviso"])).toEqual({ estado: "convertible", avisos: ["aviso"] });
  });

  test("un fotograma no: se convierte el clip", () => {
    expect(motivoParaNoConvertir(clip({ tipo: "fotograma" }))).toContain("Solo se convierte en proyecto un clip");
  });

  test("un clip en curso no, y dice que espere", () => {
    for (const estado of ["en_cola", "enviado", "en_curso", "esperando_limite"] as const) {
      expect(motivoParaNoConvertir(clip({ estado }))).toContain("todavía se está generando");
    }
  });

  test("un clip fallido o cancelado no, y manda al historial a ver si se cobró", () => {
    for (const estado of ["fallido", "cancelado"] as const) {
      expect(motivoParaNoConvertir(clip({ estado }))).toContain("si se cobró");
    }
    expect(motivoParaNoConvertir(clip({ estado: "desconocido" }))).toContain("no respondió");
  });

  test("sin archivo en la biblioteca no hay clip que reutilizar", () => {
    expect(motivoParaNoConvertir(clip({ tieneMedio: false }))).toContain("papelera");
  });

  test("sin la imagen de partida no hay fotograma para la escena", () => {
    expect(motivoParaNoConvertir(clip({ tieneImagenDePartida: false }))).toContain("imagen de partida");
  });

  test("dos personajes y canto no se ocultan: dicen por qué", () => {
    expect(motivoParaNoConvertir(clip({ turnoDeConversacion: true }))).toContain("dos personajes");
    expect(motivoParaNoConvertir(clip({ canto: true }))).toContain("cantado");
  });

  test("un consentimiento caducado no se salta al convertir", () => {
    const motivo = motivoParaNoConvertir(clip({ motivosPersonaje: ["Su consentimiento está revocado."] }));
    expect(motivo).toContain("«Lucía»");
    expect(motivo).toContain("revocado");
    expect(motivo).toContain("no se ha creado nada");
  });

  test("las declaraciones que faltan se nombran, y las que no aplican no cuentan", () => {
    expect(declaracionesQueFaltan({ derechosImagen: true, revisionDeFotos: null, derechoMarca: null })).toEqual([]);
    const faltan = declaracionesQueFaltan({ derechosImagen: false, revisionDeFotos: false, derechoMarca: false });
    expect(faltan).toHaveLength(3);
    expect(
      motivoParaNoConvertir(
        clip({ declaraciones: { derechosImagen: true, revisionDeFotos: true, derechoMarca: false } }),
      ),
    ).toContain("derecho a usar la marca");
  });

  test("un clip ya convertido lleva a su proyecto aunque ahora no se pudiera convertir", () => {
    const estado = estadoDeConversion(clip({ proyecto: { id: "p1", titulo: "Mi proyecto" }, tieneMedio: false }));
    expect(estado).toEqual({
      estado: "convertido",
      proyectoId: "p1",
      titulo: "Mi proyecto",
      url: "/proyectos/p1?paso=escenas",
    });
  });
});

describe("qué se copia del clip", () => {
  test("toda la dirección elegida pasa a sus columnas, sin perder ninguna", () => {
    const direccion = {
      ...DIRECCION_CON_ACENTO_VACIA,
      formatoClip: "voz_en_off" as const,
      plano: "primer-plano",
      angulo: "picado",
      camara: "travelling",
      microaccion: "sonreir",
      momentoMicroaccion: "despues" as const,
      direccionVocal: "cercano",
      optica: "50mm",
      luz: "ventana",
      localizacion: "cocina",
      registroEstetico: "influencer" as const,
      instruccionesExtra: "sin prisa",
      modoExperto: true,
      descripcionExperta: "todo a mano",
    };
    expect(columnasDeDireccion(direccion)).toEqual({
      clipFormat: "voz_en_off",
      shotType: "primer-plano",
      cameraAngle: "picado",
      cameraMove: "travelling",
      microAction: "sonreir",
      microActionTiming: "despues",
      dialogueDirection: "cercano",
      opticsPreset: "50mm",
      lightPreset: "ventana",
      locationPreset: "cocina",
      aestheticRegister: "influencer",
      extraInstructions: "sin prisa",
      expertMode: true,
      expertDescription: "todo a mano",
    });
  });

  test("la duración del proyecto es la del clip si un proyecto la ofrece; si no, la de fábrica", () => {
    expect(duracionDelProyecto(4)).toBe(4);
    expect(duracionDelProyecto(7)).toBe(8);
    expect(duracionDelProyecto("8")).toBe(8);
    expect(duracionDelProyecto(undefined)).toBe(8);
  });

  test("los segundos del clip se leen donde los guarda el motor, con el campo raíz de respaldo", () => {
    expect(segundosDelClip({ parametros: { segundos: 4 }, segundos: 8 })).toBe(4);
    expect(segundosDelClip({ parametros: {}, segundos: 6 })).toBe(6);
    expect(segundosDelClip({ parametros: { aspect_ratio: "9:16" } })).toBeUndefined();
    expect(segundosDelClip(null)).toBeUndefined();
    expect(duracionDelProyecto(segundosDelClip({ parametros: { segundos: 10 } }))).toBe(8);
  });

  test("el techo del proyecto nunca nace por debajo de lo que ya costó el clip", () => {
    expect(techoInicial(500, 60)).toBe(500);
    expect(techoInicial(30, 60.4)).toBe(61);
    expect(techoInicial(0, 60)).toBe(0);
  });

  test("el título lleva el trend o el día, y nunca pasa del máximo", () => {
    const dia = new Date("2026-09-30T10:00:00Z");
    expect(tituloDelProyecto("Unboxing", dia)).toBe("«Unboxing» desde Crear");
    expect(tituloDelProyecto(null, dia)).toBe("Clip de Crear del 30/9/2026");
    expect(tituloDelProyecto("x".repeat(200), dia).length).toBe(TITULO_MAXIMO);
  });

  test("el proyecto se abre en su paso de escenas", () => {
    expect(urlDelProyectoConvertido("abc")).toBe("/proyectos/abc?paso=escenas");
  });
});
