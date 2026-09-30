import { describe, expect, test } from "bun:test";
import { AVISO_DOS_MOVIMIENTOS, AVISO_MOVIMIENTO_AVANZADO, EJES_VOZ_POR_DEFECTO } from "@/lib/direccion";
import { type DireccionDeClip, dirigirClip } from "./clip";
import { FORMATO_CLIP_INGLES, FORMATO_CLIP_TREND_INGLES, REGISTRO_CAMARA_INGLES, REGLA_ANTI_CORTE } from "./ingles";

/**
 * Lo que decide un trend **no llega al modelo** aunque venga elegido: ni la clave del catálogo ni la frase por defecto
 * («la cámara se queda quieta»). Así no hay dos cabeceras de cámara ni dos reglas que se contradigan, y un cliente
 * antiguo o una petición manipulada no pueden meterlas.
 */
const PLANO = "Close-up on the face and shoulders";
const ANGULO = "Camera above eye level, looking down";
const MOVIMIENTO = "The camera arcs slowly around the subject, keeping them centred";
const GESTO = "The character breaks into a short, genuine smile";
const TEXTO_TREND = "First-person unboxing in one continuous close shot. Scene detail: a kitchen.";

const base: DireccionDeClip = {
  formato: "ugc_a_camara",
  movimientosCamara: [MOVIMIENTO, "The camera pulls back steadily"],
  nivelCamara: "avanzado",
  plano: PLANO,
  angulo: ANGULO,
  registroEstetico: "influencer",
  sujeto: "A person",
  personajeReal: false,
  escena: TEXTO_TREND,
  instruccionesExtra: "Keep the label visible",
  modoExperto: false,
  descripcionExperta: "",
  anclajes: "",
  microaccion: GESTO,
  momentoMicroaccion: "despues",
  dialogo: "",
  direccionVocal: "",
  ejesVoz: EJES_VOZ_POR_DEFECTO,
  acento: "es_ES_madrid",
  segundos: 8,
};

describe("categorías que decide el trend", () => {
  test("sin nada decidido, un trend compone la dirección como hasta ahora", () => {
    const antes = dirigirClip({ ...base, trend: { permiteHabla: false } });
    const ahora = dirigirClip({ ...base, trend: { permiteHabla: false, decide: [] } });
    expect(ahora).toEqual(antes);
    expect(ahora.escena).toContain(PLANO);
    expect(ahora.escena).toContain(MOVIMIENTO);
    expect(ahora.avisos).toContain(AVISO_DOS_MOVIMIENTOS);
  });

  test("lo decidido no se envía aunque llegue elegido, y lo demás sí", () => {
    const clip = dirigirClip({ ...base, trend: { permiteHabla: false, decide: ["plano", "camara", "microaccion"] } });
    expect(clip.escena).not.toContain(PLANO);
    expect(clip.escena).not.toContain(MOVIMIENTO);
    expect(clip.escena).not.toContain(GESTO);
    // Ni la frase por defecto de la cámara: contradiría la que dicta el trend.
    expect(clip.escena).not.toContain("The camera stays locked off");
    // Lo que no decide sigue siendo del usuario.
    expect(clip.escena).toContain(ANGULO);
    expect(clip.escena).toContain(REGISTRO_CAMARA_INGLES.influencer);
    expect(clip.escena).toContain("Keep the label visible");
    expect(clip.escena).toContain(TEXTO_TREND);
    expect(clip.escena.endsWith(REGLA_ANTI_CORTE)).toBe(true);
    // Tampoco avisa de lo que no va a enviar.
    expect(clip.avisos).not.toContain(AVISO_DOS_MOVIMIENTOS);
    expect(clip.avisos).not.toContain(AVISO_MOVIMIENTO_AVANZADO);
  });

  test("si el trend decide el registro estético, su frase de cámara no se añade", () => {
    const clip = dirigirClip({ ...base, trend: { permiteHabla: false, decide: ["registro-estetico", "angulo"] } });
    expect(clip.escena).not.toContain(REGISTRO_CAMARA_INGLES.influencer);
    expect(clip.escena).not.toContain(ANGULO);
    expect(clip.escena).toContain(PLANO);
  });

  test("sin trend, decidir no existe: la dirección entera se envía", () => {
    const clip = dirigirClip({ ...base, trend: null });
    expect(clip.escena).toContain(PLANO);
    expect(clip.escena).toContain(MOVIMIENTO);
    expect(clip.escena).toContain(GESTO);
  });

  test("con un trend mudo o que dicta el encuadre, el formato no dice «a cámara»", () => {
    for (const trend of [
      { permiteHabla: false },
      { permiteHabla: true, decide: ["plano" as const] },
      { permiteHabla: true, decide: ["angulo" as const] },
      { permiteHabla: true, decide: ["camara" as const] },
    ]) {
      const clip = dirigirClip({ ...base, trend });
      expect(clip.escena).not.toContain("talking straight to camera");
      expect(clip.escena.startsWith(FORMATO_CLIP_TREND_INGLES)).toBe(true);
    }
  });

  test("un trend con habla que no dicta el encuadre conserva el formato «a cámara»", () => {
    const clip = dirigirClip({ ...base, trend: { permiteHabla: true, decide: ["microaccion"] } });
    expect(clip.escena.startsWith(FORMATO_CLIP_INGLES.ugc_a_camara)).toBe(true);
  });

  test("sin trend la dirección es exactamente la de antes", () => {
    const sinTrend = dirigirClip({ ...base, movimientosCamara: [], nivelCamara: "basico" });
    expect(sinTrend.escena.split("\n")[0]).toBe(
      `${FORMATO_CLIP_INGLES.ugc_a_camara}. ${PLANO}. ${ANGULO}. The camera stays locked off and does not move. ${REGISTRO_CAMARA_INGLES.influencer}${REGISTRO_CAMARA_INGLES.influencer.endsWith(".") ? "" : "."}`,
    );
    expect(dirigirClip({ ...base, trend: null })).toEqual(dirigirClip(base));
  });
});
