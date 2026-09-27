import { describe, expect, it } from "bun:test";
import {
  DURACIONES_DISPONIBLES,
  type EscenaProduccionVista,
  ETAPAS_TRABAJO,
  efectoDeCancelar,
  esDuracionDisponible,
  etapaDeTrabajo,
  etapasDeTrabajo,
  falloConCoste,
  fotogramaPorAprobar,
  type TrabajoDeEscena,
  textoDeCancelacion,
  trabajoEnMarcha,
  ZONAS_SEGURAS,
} from "./produccion";

/**
 * Funciones puras de la producción de escenas (RF06, 0.19.0).
 *
 * El test que más importa es el del **progreso**: las etapas salen del estado real y de la etapa apuntada, y en
 * ningún caso aparece un número entre 0 y 100 ni nada que dependa de un reloj.
 */

const trabajo = (cambios: Partial<TrabajoDeEscena> = {}): TrabajoDeEscena => ({
  id: "t1",
  tipo: "fotograma",
  estado: "en_cola",
  estadoProveedor: null,
  etapa: null,
  creditosEstimados: 4,
  creditosConsumidos: null,
  error: null,
  motivoFallo: null,
  posicionEnCola: null,
  medio: null,
  modelo: "modelo-de-prueba",
  creadoEn: "2026-09-27T10:00:00.000Z",
  enviadoEn: null,
  terminadoEn: null,
  ...cambios,
});

const escena = (cambios: Partial<EscenaProduccionVista> = {}): EscenaProduccionVista => ({
  id: "e1",
  orden: 1,
  resumen: "Saluda a cámara",
  estado: "aprobada",
  segundos: 4,
  controles: { estado: "listo", reglasVersion: "x", comprobaciones: [] },
  fotograma: null,
  animacion: null,
  fotogramaAprobado: null,
  clip: null,
  creditosEstimados: 10,
  creditosConsumidos: 0,
  reintentosUsados: 0,
  presupuestoReintentos: 0,
  motivoUltimoFallo: "",
  cambiadaDesdeLaGeneracion: false,
  versiones: [],
  ...cambios,
});

describe("etapas del trabajo", () => {
  it("un trabajo en cola todavía no ha entrado en ninguna etapa", () => {
    expect(etapaDeTrabajo("en_cola", null)).toBeNull();
    expect(etapaDeTrabajo("esperando_limite", null)).toBeNull();
  });

  it("el estado manda sobre la etapa guardada", () => {
    // Una fila que quedó apuntada en `descargando` pero cuyo estado es `enviado` va por `enviado`: el estado es
    // lo que decide el dinero, así que es lo que se cuenta.
    expect(etapaDeTrabajo("enviado", "descargando")).toBe("enviado");
    expect(etapaDeTrabajo("preparando", "listo")).toBe("preparando");
    expect(etapaDeTrabajo("listo", null)).toBe("listo");
  });

  it("la descarga solo se distingue con la etapa apuntada, porque el estado sigue en curso", () => {
    expect(etapaDeTrabajo("en_curso", null)).toBe("en_curso");
    expect(etapaDeTrabajo("en_curso", "descargando")).toBe("descargando");
  });

  it("un trabajo que falló conserva la última etapa por la que pasó", () => {
    expect(etapaDeTrabajo("fallido", "enviado")).toBe("enviado");
    expect(etapaDeTrabajo("cancelado", null)).toBeNull();
  });

  it("las cinco etapas se marcan hechas, en curso o pendientes según la actual", () => {
    const etapas = etapasDeTrabajo("en_curso", null);
    expect(etapas).toHaveLength(ETAPAS_TRABAJO.length);
    expect(etapas.map((e) => e.estado)).toEqual(["hecha", "hecha", "en-curso", "pendiente", "pendiente"]);
  });

  it("un trabajo listo tiene las cinco etapas hechas", () => {
    expect(etapasDeTrabajo("listo", "listo").every((e) => e.estado === "hecha")).toBe(true);
  });

  it("un fallo marca con error la etapa en la que se quedó y deja las siguientes pendientes", () => {
    const etapas = etapasDeTrabajo("fallido", "enviado");
    expect(etapas.map((e) => e.estado)).toEqual(["hecha", "error", "pendiente", "pendiente", "pendiente"]);
  });

  it("ninguna etapa lleva un porcentaje ni una cuenta atrás", () => {
    for (const estado of ["en_cola", "preparando", "enviado", "en_curso", "listo", "fallido"] as const) {
      for (const etapa of etapasDeTrabajo(estado, null)) {
        expect(etapa.nombre).not.toMatch(/\d\s*%|\d+\s*(s|seg|min)\b|restante/i);
      }
    }
  });
});

describe("cancelación de una escena", () => {
  it("lo que no ha salido se cancela y lo que ya salió se cobra", () => {
    const efecto = efectoDeCancelar(
      escena({ fotograma: trabajo({ estado: "en_curso" }), animacion: trabajo({ id: "t2", estado: "en_cola" }) }),
    );
    expect(efecto).toEqual({ seCancelan: 1, seCobraran: 1 });
    const texto = textoDeCancelacion(efecto);
    expect(texto).toContain("se soltará su reserva");
    expect(texto).toContain("se cobrará");
  });

  it("sin nada en marcha no hay nada que cancelar y se dice", () => {
    expect(efectoDeCancelar(escena())).toEqual({ seCancelan: 0, seCobraran: 0 });
    expect(textoDeCancelacion({ seCancelan: 0, seCobraran: 0 })).toContain("nada en marcha");
  });

  it("un trabajo terminado no cuenta ni como cancelable ni como cobrable", () => {
    expect(efectoDeCancelar(escena({ fotograma: trabajo({ estado: "listo" }) }))).toEqual({
      seCancelan: 0,
      seCobraran: 0,
    });
  });

  it("nunca promete cancelar lo que ya está en el proveedor", () => {
    const texto = textoDeCancelacion({ seCancelan: 0, seCobraran: 2 });
    expect(texto).toContain("no admite cancelarlos");
    expect(texto).not.toMatch(/se (han|ha) cancelado/);
  });
});

describe("reintentos de pago", () => {
  it("solo los fallos sin coste probado se repiten sin consumir reintentos", () => {
    expect(falloConCoste("interno")).toBe(false);
    expect(falloConCoste("limite")).toBe(false);
    expect(falloConCoste("credencial")).toBe(false);
    expect(falloConCoste(null)).toBe(false);
    // Estos tres pueden haberse pagado: un 5xx no prueba nada y algunos modelos cobran el intento.
    expect(falloConCoste("temporal")).toBe(true);
    expect(falloConCoste("contenido")).toBe(true);
    expect(falloConCoste("respuesta")).toBe(true);
  });
});

describe("duraciones disponibles", () => {
  it("solo se ofrece la duración con coste medido", () => {
    expect(DURACIONES_DISPONIBLES).toEqual([4]);
    expect(esDuracionDisponible(4)).toBe(true);
    // Los 8 s que proponía la fase quedan fuera mientras no se mida su coste real.
    expect(esDuracionDisponible(8)).toBe(false);
  });
});

describe("estado de la escena", () => {
  it("un fotograma listo y sin aprobar espera a que una persona lo mire", () => {
    const medio = { id: "m1" } as never;
    expect(fotogramaPorAprobar(escena({ fotograma: trabajo({ estado: "listo", medio }) }))).toBe(true);
    // Ya aprobado: no vuelve a pedirse.
    expect(
      fotogramaPorAprobar(escena({ fotograma: trabajo({ estado: "listo", medio }), fotogramaAprobado: medio })),
    ).toBe(false);
  });

  it("un trabajo en marcha es el que sigue vivo en la cola o en el proveedor", () => {
    expect(trabajoEnMarcha(trabajo({ estado: "enviado" }))).toBe(true);
    expect(trabajoEnMarcha(trabajo({ estado: "listo" }))).toBe(false);
    expect(trabajoEnMarcha(null)).toBe(false);
  });
});

describe("zonas seguras", () => {
  it("las tres plataformas verticales están descritas con sus franjas y su nota", () => {
    expect(ZONAS_SEGURAS.map((z) => z.plataforma)).toEqual(["TikTok", "Reels", "Shorts"]);
    for (const zona of ZONAS_SEGURAS) {
      expect(zona.arribaPorCiento + zona.abajoPorCiento).toBeLessThan(100);
      expect(zona.derechaPorCiento).toBeGreaterThan(0);
      expect(zona.nota.trim()).not.toBe("");
    }
  });
});
