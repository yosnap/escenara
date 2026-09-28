import { describe, expect, test } from "bun:test";
import {
  ACENTO_POR_DEFECTO,
  ACENTOS,
  AVISO_DOS_MOVIMIENTOS,
  AVISO_GUION_EN_CLIP_MUDO,
  EJES_VOZ_POR_DEFECTO,
  type EjesVoz,
  ejesVozDe,
  firmaDeVoz,
} from "@/lib/direccion";
import { type DireccionDeClip, dirigirClip, dirigirClipPara, familiaDe } from "./clip";
import { camposDeLaRespuesta } from "./extraccion";
import { pedidoDeDireccion, resumirDireccion } from "./fidelidad";
import { componerSeisC, type SeisC } from "./fotograma";
import { motivoSinHoja, promptHojaIdentidad } from "./hoja-identidad";
import {
  ACENTO_INGLES,
  ANCLAJES_REALISMO,
  ATRACTIVO_ELEGIDO,
  MODO_MUDO,
  REGLA_ANTI_CORTE,
  SIN_RETOQUE_FINAL,
} from "./ingles";
import { describirVoz, resumirVoz } from "./voz";

/**
 * Dirección del clip (0.25.0) **sin llamar a nadie**: los compositores son funciones puras y la extracción se
 * prueba sobre la respuesta que devolvería la percepción, no sobre una llamada.
 *
 * Lo que se comprueba aquí es lo que esta versión promete: que lo que el usuario elige llega al prompt, en el
 * orden en que llega, y que lo que no se negocia —la regla anti-corte, el bloque de anclajes y no embellecer a
 * una persona real— está siempre.
 */

const DIALOGO = "Esto es lo que quiero que diga, tal cual.";
/** Una frase que no cabe en cuatro segundos: es la que se usó en el spike. */
const LARGO = "Te voy a contar una cosa que casi nadie sabe, y que a mí me cambió la semana entera de arriba abajo.";

const DIRECCION: DireccionDeClip = {
  formato: "ugc_a_camara",
  movimientosCamara: ["The camera pushes in slowly towards the face"],
  nivelCamara: "basico",
  plano: "Medium shot framed from the waist up",
  angulo: "Camera at eye level, straight on",
  registroEstetico: "ugc_real",
  sujeto: "A woman in her thirties",
  personajeReal: true,
  escena: "Standing in a lived-in kitchen",
  microaccion: "The character nods once, briefly",
  momentoMicroaccion: "antes",
  dialogo: DIALOGO,
  direccionVocal: "in a close, unhurried tone",
  ejesVoz: EJES_VOZ_POR_DEFECTO,
  acento: "es_ES_madrid",
  segundos: 8,
};

/** Posición del primer trozo que contiene ese texto. −1 si no está. */
const posicionDe = (texto: string, aguja: string) => texto.indexOf(aguja);

describe("composición del prompt del clip", () => {
  test("el orden es cámara, gesto previo, guion, gesto posterior, voz y acento", () => {
    const { escena } = dirigirClip({ ...DIRECCION, momentoMicroaccion: "antes" }, { dialogoDentro: true });
    const camara = posicionDe(escena, "pushes in slowly");
    const gesto = posicionDe(escena, "nods once");
    const guion = posicionDe(escena, DIALOGO);
    const voz = posicionDe(escena, "The voice is");
    const acento = posicionDe(escena, "European Spanish");
    expect(camara).toBeGreaterThanOrEqual(0);
    expect(camara).toBeLessThan(gesto);
    expect(gesto).toBeLessThan(guion);
    expect(guion).toBeLessThan(voz);
    expect(voz).toBeLessThan(acento);
  });

  test("el encuadre y el ángulo van en el primer bloque, antes del sujeto", () => {
    const { escena } = dirigirClip(DIRECCION);
    expect(posicionDe(escena, "Medium shot")).toBeLessThan(posicionDe(escena, "A woman in her thirties"));
    expect(posicionDe(escena, "eye level")).toBeLessThan(posicionDe(escena, "A woman in her thirties"));
  });

  test("con micro-acción «antes» el gesto va delante del diálogo", () => {
    const { escena } = dirigirClip({ ...DIRECCION, momentoMicroaccion: "antes" }, { dialogoDentro: true });
    expect(posicionDe(escena, "nods once")).toBeLessThan(posicionDe(escena, DIALOGO));
  });

  test("con micro-acción «durante» o «después» el gesto va detrás del diálogo", () => {
    for (const momento of ["durante", "despues"] as const) {
      const { escena } = dirigirClip({ ...DIRECCION, momentoMicroaccion: momento }, { dialogoDentro: true });
      expect(posicionDe(escena, DIALOGO)).toBeLessThan(posicionDe(escena, "nods once"));
    }
  });

  test("la regla anti-corte está siempre, también sin movimiento de cámara elegido", () => {
    expect(dirigirClip(DIRECCION).escena).toContain(REGLA_ANTI_CORTE);
    const quieta = dirigirClip({ ...DIRECCION, movimientosCamara: [] });
    expect(quieta.escena).toContain(REGLA_ANTI_CORTE);
    // Y sin movimiento se dice que la cámara no se mueve: callarlo deja al modelo inventando un travelling.
    expect(quieta.escena).toContain("does not move");
  });

  test("la regla anti-corte es la última: nada va detrás de ella", () => {
    const { escena } = dirigirClip(DIRECCION);
    expect(escena.trimEnd().endsWith(REGLA_ANTI_CORTE)).toBe(true);
  });

  test("en voz en off el prompt marca boca cerrada y sin voz, y el diálogo no viaja", () => {
    const mudo = dirigirClip({ ...DIRECCION, formato: "voz_en_off" }, { dialogoDentro: true });
    expect(mudo.escena).toContain(MODO_MUDO);
    expect(mudo.escena).not.toContain(DIALOGO);
    expect(mudo.dialogo).toBe("");
    // El guion escrito no se pierde sin decirlo: se avisa de qué se ha hecho con él.
    expect(mudo.avisos).toContain(AVISO_GUION_EN_CLIP_MUDO);
  });

  test("en voz en off tampoco se describe la voz ni el acento", () => {
    const { escena } = dirigirClip({ ...DIRECCION, formato: "voz_en_off" });
    expect(escena).not.toContain("The voice is");
    expect(escena).not.toContain("European Spanish");
  });

  test("el diálogo llega sin traducir y entre comillas; el resto del prompt está en inglés", () => {
    const { escena, dialogo } = dirigirClip(DIRECCION, { dialogoDentro: true });
    expect(dialogo).toBe(DIALOGO);
    expect(escena).toContain(`"${DIALOGO}"`);
    // Lo que rodea a la frase es inglés: el idioma se nombra, no se traduce la frase.
    expect(escena).toContain('says, in Spanish, exactly: "');
  });

  test("dos movimientos a la vez avisan y solo se envía el primero", () => {
    const dos = dirigirClip({
      ...DIRECCION,
      movimientosCamara: ["The camera pushes in slowly towards the face", "The camera arcs slowly around"],
    });
    expect(dos.avisos).toContain(AVISO_DOS_MOVIMIENTOS);
    expect(dos.escena).toContain("pushes in slowly");
    expect(dos.escena).not.toContain("arcs slowly around");
  });

  test("si la frase llena el clip, el gesto se queda dentro del habla y se dice por qué", () => {
    // Medido en el spike del 2026-09-28: con una frase larga en 4 s el personaje habla de principio a fin.
    const apretado = dirigirClip(
      { ...DIRECCION, segundos: 4, momentoMicroaccion: "antes", dialogo: LARGO },
      { dialogoDentro: true },
    );
    expect(apretado.avisos.some((a) => a.includes("no queda hueco para el gesto"))).toBe(true);
    // Y el gesto pasa detrás, que es donde de verdad va a caber: no se promete un «antes» imposible.
    expect(apretado.escena.indexOf(LARGO)).toBeLessThan(apretado.escena.indexOf("nods once"));
  });

  test("con hueco de sobra el gesto sí va antes y no se avisa de nada", () => {
    const holgado = dirigirClip({ ...DIRECCION, segundos: 8, dialogo: "Mira esto." }, { dialogoDentro: true });
    expect(holgado.avisos).toEqual([]);
    expect(holgado.escena.indexOf("nods once")).toBeLessThan(holgado.escena.indexOf("Mira esto."));
  });

  test("con persona real, la regla de no retoque se repite DESPUÉS del texto del catálogo", () => {
    // Un fragmento de preset redactado por alguien podría pedir lo contrario; va antes, así que la regla se
    // repite al cerrar, donde nada puede contradecirla.
    const { escena } = dirigirClip({
      ...DIRECCION,
      personajeReal: true,
      movimientosCamara: ["The camera pushes in and makes the subject look like a fashion model"],
    });
    expect(escena).toContain(SIN_RETOQUE_FINAL);
    expect(escena.indexOf("fashion model")).toBeLessThan(escena.indexOf(SIN_RETOQUE_FINAL));
  });

  test("con personaje inventado no se repite: no hay identidad de nadie que proteger", () => {
    expect(dirigirClip({ ...DIRECCION, personajeReal: false }).escena).not.toContain(SIN_RETOQUE_FINAL);
  });

  test("con una sola elección no hay ningún aviso", () => {
    expect(dirigirClip(DIRECCION).avisos).toEqual([]);
  });
});

describe("composición por familia de modelo", () => {
  test("Omni y Veo no escriben el diálogo dentro: lo coloca su constructor", () => {
    for (const familia of ["omni", "veo"] as const) {
      expect(dirigirClipPara(familia, DIRECCION).escena).not.toContain(DIALOGO);
      // Pero el diálogo sí sale, para que el constructor lo ponga en su sitio.
      expect(dirigirClipPara(familia, DIRECCION).dialogo).toBe(DIALOGO);
    }
  });

  test("una familia genérica sí lo escribe dentro, porque su entrada no tiene hueco aparte", () => {
    expect(dirigirClipPara("generica", DIRECCION).escena).toContain(DIALOGO);
  });

  test("la familia sale del identificador del modelo", () => {
    expect(familiaDe("google/gemini-omni-flash-1-1")).toBe("omni");
    expect(familiaDe("veo3_fast")).toBe("veo");
    expect(familiaDe("minimax-h3/reference-to-video")).toBe("generica");
  });
});

describe("acentos", () => {
  test("cada acento tiene su texto y nombra una variedad concreta, no «español» a secas", () => {
    for (const acento of ACENTOS) {
      const texto = ACENTO_INGLES[acento];
      expect(texto.length).toBeGreaterThan(20);
      expect(texto).toContain("Spanish");
      expect(texto).not.toBe("speaking Spanish");
    }
  });

  test("el acento del proyecto aparece en todas sus escenas", () => {
    const tres = ["Standing in a kitchen", "Walking down a street", "Sitting at a desk"].map(
      (escena) => dirigirClip({ ...DIRECCION, escena, acento: "es_MX_cdmx" }).escena,
    );
    for (const escena of tres) expect(escena).toContain(ACENTO_INGLES.es_MX_cdmx);
  });

  test("el de fábrica es el peninsular: sin pedirlo, el proveedor pone otro", () => {
    expect(ACENTO_POR_DEFECTO).toBe("es_ES_madrid");
    expect(ACENTO_INGLES[ACENTO_POR_DEFECTO]).toContain("European Spanish");
  });
});

describe("compositor de voz", () => {
  const VOZ = { ejes: EJES_VOZ_POR_DEFECTO, acento: "es_ES_madrid" as const, vozPresetId: "kore", matiz: "" };

  test("los cinco ejes entran en la descripción que se registra", () => {
    const grave: EjesVoz = { ...EJES_VOZ_POR_DEFECTO, genero: "masculina", gravedad: "grave", textura: "rasgada" };
    const texto = describirVoz({ ...VOZ, ejes: grave });
    expect(texto).toContain("male voice");
    expect(texto).toContain("low-pitched");
    expect(texto).toContain("raspy");
  });

  test("el acento va en la descripción: una voz sin acento suena distinta cada vez", () => {
    expect(describirVoz({ ...VOZ, acento: "es_AR_rioplatense" })).toContain("Rioplatense");
  });

  test("nunca sale vacía ni pasa del límite del proveedor", () => {
    const texto = describirVoz({ ...VOZ, matiz: "x".repeat(30_000) });
    expect(texto.length).toBeGreaterThan(0);
    expect(texto.length).toBeLessThanOrEqual(20_000);
  });

  test("el resumen para el usuario va en castellano y no lleva inglés de prompt", () => {
    const resumen = resumirVoz(VOZ);
    expect(resumen).toContain("acento");
    expect(resumen).not.toContain("voice");
  });

  test("unos ejes desconocidos caen al valor de fábrica en lugar de romper", () => {
    expect(ejesVozDe({ genero: "marciana", edad: "joven" })).toEqual({
      ...EJES_VOZ_POR_DEFECTO,
      edad: "joven",
    });
    expect(ejesVozDe(null)).toEqual(EJES_VOZ_POR_DEFECTO);
  });

  test("cambiar un eje o el acento cambia la firma, que es lo que invalida el registro", () => {
    const base = firmaDeVoz(EJES_VOZ_POR_DEFECTO, "es_ES_madrid", "kore");
    expect(firmaDeVoz({ ...EJES_VOZ_POR_DEFECTO, gravedad: "grave" }, "es_ES_madrid", "kore")).not.toBe(base);
    expect(firmaDeVoz(EJES_VOZ_POR_DEFECTO, "es_MX_cdmx", "kore")).not.toBe(base);
    expect(firmaDeVoz(EJES_VOZ_POR_DEFECTO, "es_ES_madrid", "leda")).not.toBe(base);
    expect(firmaDeVoz(EJES_VOZ_POR_DEFECTO, "es_ES_madrid", "kore")).toBe(base);
  });
});

describe("método 6C del fotograma", () => {
  const SEIS: SeisC = {
    personaje: "A woman in her thirties",
    personajeReal: true,
    atractivoElegido: false,
    plano: "Medium shot framed from the waist up",
    angulo: "Camera at a three-quarter angle",
    optica: "Portrait lens with a shallow depth of field",
    ropa: "An oversized grey jumper",
    localizacion: "In a home kitchen",
    contextoLibre: "with morning light coming in",
    luz: "Soft daylight from a window",
    accion: "Holding a mug with both hands",
    registroEstetico: "ugc_real",
    anclajes: "",
  };

  test("el orden es C1 personaje, C2 cámara, C3 ropa, C4 contexto, C5 luz y C6 anclajes", () => {
    const prompt = componerSeisC(SEIS);
    const orden = ["Subject:", "Camera:", "Wardrobe:", "Context:", "Light:", "Realism:"].map((c) =>
      posicionDe(prompt, c),
    );
    for (const posicion of orden) expect(posicion).toBeGreaterThanOrEqual(0);
    expect(orden).toEqual([...orden].sort((a, b) => a - b));
  });

  test("termina siempre con el bloque de anclajes, y sin catálogo usa el del código", () => {
    const prompt = componerSeisC(SEIS);
    expect(prompt.lastIndexOf("Realism:")).toBeGreaterThan(prompt.lastIndexOf("Light:"));
    expect(prompt).toContain(ANCLAJES_REALISMO);
    expect(prompt).toContain("no watermarks");
    expect(prompt).toContain("no distorted or duplicated body parts");
  });

  test("el bloque de anclajes entra aunque el usuario no haya elegido nada más", () => {
    const vacio = componerSeisC({
      ...SEIS,
      plano: "",
      angulo: "",
      optica: "",
      ropa: "",
      localizacion: "",
      contextoLibre: "",
      luz: "",
      accion: "",
    });
    expect(vacio).toContain("Realism:");
    expect(vacio).toContain("no watermarks");
  });

  test("con un personaje real no aparece ningún adjetivo de atractivo, ni pidiéndolo", () => {
    const pedido = componerSeisC({ ...SEIS, personajeReal: true, atractivoElegido: true });
    expect(pedido).not.toContain(ATRACTIVO_ELEGIDO);
    expect(pedido).not.toContain("model-level");
    // Y se dice expresamente que no se le retoque.
    expect(pedido).toContain("do not make them more or less attractive");
  });

  test("un rasgo de la ficha se reproduce, no se exagera: las pecas y el bronceado no suben con la escena", () => {
    const prompt = componerSeisC({ ...SEIS, personajeReal: true, localizacion: "On a beach at midday" });
    expect(prompt).toContain("never exaggerate, intensify or add more of it");
    expect(prompt).toContain("not an effect to apply");
  });

  test("con un personaje inventado solo aparece si se eligió expresamente", () => {
    expect(componerSeisC({ ...SEIS, personajeReal: false, atractivoElegido: false })).not.toContain("model-level");
    expect(componerSeisC({ ...SEIS, personajeReal: false, atractivoElegido: true })).toContain(ATRACTIVO_ELEGIDO);
  });

  test("con persona real, el cierre repite el no retoque después de todo el catálogo", () => {
    const prompt = componerSeisC({ ...SEIS, personajeReal: true, luz: "Soft light, flawless model skin" });
    expect(prompt).toContain(SIN_RETOQUE_FINAL);
    expect(prompt.indexOf("flawless model skin")).toBeLessThan(prompt.indexOf(SIN_RETOQUE_FINAL));
  });

  test("el registro estético modula cámara y luz, nunca la identidad", () => {
    const influencer = componerSeisC({ ...SEIS, registroEstetico: "influencer" });
    const ugc = componerSeisC({ ...SEIS, registroEstetico: "ugc_real" });
    expect(influencer).toContain("deliberate composition");
    expect(ugc).toContain("handheld");
    // C1 es idéntica en los dos: el registro no toca quién es.
    const c1 = (p: string) => p.slice(0, p.indexOf("Camera:"));
    expect(c1(influencer)).toBe(c1(ugc));
  });
});

describe("modo «cambiar solo…»", () => {
  const BASE: SeisC = {
    personaje: "A woman in her thirties",
    personajeReal: true,
    atractivoElegido: false,
    plano: "Medium shot",
    angulo: "Camera at eye level",
    optica: "Portrait lens",
    ropa: "An oversized grey jumper",
    localizacion: "In a home kitchen",
    contextoLibre: "",
    luz: "Soft daylight from a window",
    accion: "Holding a mug",
    registroEstetico: "ugc_real",
    anclajes: "Photographic realism anchors.",
  };

  test("cambiar solo el outfit conserva literalmente C1, C2, C4, C5 y C6 y solo cambia C3", () => {
    const original = componerSeisC(BASE);
    const cambiado = componerSeisC(BASE, {
      que: "outfit",
      valor: "a black leather jacket",
      conSegundaReferencia: false,
    });
    const bloque = (prompt: string, nombre: string) =>
      prompt.split("\n").find((linea) => linea.startsWith(`${nombre}:`)) ?? "";
    for (const nombre of ["Subject", "Camera", "Context", "Light", "Realism"]) {
      expect(bloque(cambiado, nombre)).toBe(bloque(original, nombre));
    }
    expect(bloque(cambiado, "Wardrobe")).toContain("black leather jacket");
    expect(bloque(cambiado, "Wardrobe")).not.toContain("grey jumper");
  });

  test("se dice expresamente que todo lo demás queda idéntico", () => {
    const cambiado = componerSeisC(BASE, {
      que: "localizacion",
      valor: "on a city street",
      conSegundaReferencia: false,
    });
    expect(cambiado).toContain("Everything else stays identical");
    expect(cambiado).toContain("the same person");
  });

  test("con segunda referencia se dice de dónde sale lo nuevo y que no se copie nada más", () => {
    const cambiado = componerSeisC(BASE, { que: "outfit", valor: "the jacket shown", conSegundaReferencia: true });
    expect(cambiado).toContain("second reference image");
    expect(cambiado).toContain("nothing else from that image");
  });

  test("el antes/después son dos salidas del mismo mecanismo desde la misma imagen base", () => {
    const antes = componerSeisC(BASE);
    const despues = componerSeisC(BASE, { que: "pose", valor: "arms crossed", conSegundaReferencia: false });
    expect(antes).not.toContain("Change only");
    expect(despues).toContain("Change only");
    // La identidad no se mueve entre las dos salidas: es la misma persona con un rasgo cambiado.
    expect(despues).toContain("A woman in her thirties");
  });

  test("«ninguno» no añade el bloque: un fotograma nuevo no cambia nada de nada", () => {
    expect(componerSeisC(BASE, { que: "ninguno", valor: "", conSegundaReferencia: false })).toBe(componerSeisC(BASE));
  });
});

describe("extracción de las 6C desde una foto de referencia", () => {
  /** Lo que devolvería la percepción. No se llama a nadie: se prueba el reparto en campos. */
  const RESPUESTA = [
    "CAMERA: Medium close-up at eye level, shot on a phone with a shallow depth of field.",
    "WARDROBE: An oversized beige knit jumper with no visible accessories.",
    "CONTEXT: A home kitchen with a wooden worktop and shelves behind.",
    "LIGHT: Soft daylight from a window on the left, gentle shadows, a little grain.",
  ].join("\n");

  test("devuelve los cuatro campos, editables y por separado", () => {
    const { campos, sinLeer } = camposDeLaRespuesta(RESPUESTA);
    expect(campos.camara).toContain("Medium close-up");
    expect(campos.ropa).toContain("beige knit jumper");
    expect(campos.contexto).toContain("home kitchen");
    expect(campos.luz).toContain("Soft daylight");
    expect(sinLeer).toEqual([]);
  });

  test("no devuelve C1: la identidad sale de las referencias, no de lo que se opine de una cara", () => {
    const conPersona = `SUBJECT: A beautiful young woman.\n${RESPUESTA}`;
    const { campos } = camposDeLaRespuesta(conPersona);
    expect(Object.keys(campos).sort()).toEqual(["camara", "contexto", "luz", "ropa"]);
    expect(Object.values(campos).join(" ")).not.toContain("beautiful");
  });

  test("lo que el modelo no supo leer se dice, no se inventa", () => {
    const { campos, sinLeer } = camposDeLaRespuesta("CAMERA: Medium shot.\nLIGHT: Window light.");
    expect(campos.ropa).toBe("");
    expect(sinLeer).toEqual(["ropa", "contexto"]);
  });

  test("tolera guiones, minúsculas y orden cambiado, pero no inventa lo que falta", () => {
    const desordenada = "- light: warm lamps.\n* Wardrobe: a denim jacket.\ncamera: wide shot.";
    const { campos, sinLeer } = camposDeLaRespuesta(desordenada);
    expect(campos.luz).toBe("warm lamps.");
    expect(campos.ropa).toBe("a denim jacket.");
    expect(campos.camara).toBe("wide shot.");
    expect(sinLeer).toEqual(["contexto"]);
  });

  test("una respuesta que no es de campos no rellena nada", () => {
    const { campos, sinLeer } = camposDeLaRespuesta("Sure! Here is a lovely description of the photo you sent.");
    expect(Object.values(campos).every((v) => v === "")).toBe(true);
    expect(sinLeer).toHaveLength(4);
  });
});

describe("comprobación de Jev de la dirección, en sombra", () => {
  const PEDIDA = {
    formato: "ugc_a_camara" as const,
    plano: "Plano medio",
    angulo: "Tres cuartos",
    movimientoCamara: "Zoom lento a la cara",
    microaccion: "Asiente",
    momentoMicroaccion: "antes" as const,
  };

  test("lo que se le enseña a Jev es la elección del usuario, no el prompt", () => {
    const pedido = pedidoDeDireccion(PEDIDA);
    expect(pedido.shot_size).toBe("Plano medio");
    expect(pedido.camera_movement).toBe("Zoom lento a la cara");
    // Nada de inglés de prompt: ni el fragmento del catálogo ni la regla anti-corte literal.
    expect(Object.values(pedido).join(" ")).not.toContain("pushes in");
    expect(Object.values(pedido).join(" ")).not.toContain(REGLA_ANTI_CORTE);
  });

  test("la toma única se pregunta siempre, elija lo que elija el usuario", () => {
    expect(pedidoDeDireccion(PEDIDA).single_take).toContain("sin ningún corte");
    expect(pedidoDeDireccion({ ...PEDIDA, movimientoCamara: "" }).single_take).toContain("sin ningún corte");
  });

  test("la cámara quieta se mide como elección, no como hueco", () => {
    expect(pedidoDeDireccion({ ...PEDIDA, movimientoCamara: "" }).camera_movement).toBe("la cámara se queda quieta");
  });

  test("en clip mudo se pregunta expresamente que no hable", () => {
    const mudo = pedidoDeDireccion({ ...PEDIDA, formato: "voz_en_off" });
    expect(mudo.character_speaks).toContain("clip mudo");
  });

  test("sin gesto no se pregunta por su momento", () => {
    expect(pedidoDeDireccion({ ...PEDIDA, microaccion: "" }).micro_action_timing).toBe("no aplica");
  });

  test("la previsualización del usuario va en castellano y dice que es una sola toma", () => {
    const resumen = resumirDireccion(PEDIDA);
    expect(resumen).toContain("Plano medio");
    expect(resumen).toContain("Una sola toma, sin cortes.");
    expect(resumen).not.toContain("shot");
  });
});

describe("hoja de identidad 3×3", () => {
  test("describe las nueve casillas, no «nueve retratos» a secas", () => {
    const prompt = promptHojaIdentidad("A woman in her thirties");
    expect(prompt).toContain("3 by 3 grid of 9 portraits");
    for (const vista of ["front view", "three-quarters to the left", "full left profile", "full right profile"]) {
      expect(prompt).toContain(vista);
    }
  });

  test("la identidad sale de las referencias y no se retoca, también en la hoja", () => {
    const prompt = promptHojaIdentidad("A woman in her thirties");
    expect(prompt).toContain("do not make them more or less attractive");
    expect(prompt).toContain("never exaggerate, intensify or add more of it");
  });

  test("cierra con los anclajes, así que la hoja no lleva rótulos escritos", () => {
    const prompt = promptHojaIdentidad("");
    expect(prompt.trimEnd().endsWith(ANCLAJES_REALISMO)).toBe(true);
    expect(prompt).toContain("no written words");
  });

  test("sin fotos suficientes se dice cuántas faltan en vez de generar algo peor", () => {
    expect(motivoSinHoja(1, 3)).toContain("al menos 3");
    expect(motivoSinHoja(3, 3)).toBe("");
  });
});

describe("avisos que llegan al usuario", () => {
  test("el matiz de voz ya traducido entra en el bloque de voz", () => {
    const { escena } = dirigirClip({ ...DIRECCION, direccionVocal: "in a tired, quiet tone" });
    expect(escena).toContain("in a tired, quiet tone");
    // Y va con la voz, detrás del guion, no en la cabecera de cámara.
    expect(escena.indexOf("The voice is")).toBeLessThan(escena.indexOf("in a tired, quiet tone"));
  });

  test("sin matiz no se cuela una frase vacía en el prompt", () => {
    expect(dirigirClip({ ...DIRECCION, direccionVocal: "" }).escena).not.toContain("..");
  });

  test("la duración que decide si el gesto cabe es la que se le pasa, no la de la escena", () => {
    // El mismo guion y el mismo gesto: a 4 s no cabe y a 10 s sí. Quien compone pasa la duración del modelo.
    const corto = dirigirClip({ ...DIRECCION, segundos: 4, momentoMicroaccion: "antes", dialogo: LARGO });
    const largo = dirigirClip({ ...DIRECCION, segundos: 10, momentoMicroaccion: "antes", dialogo: LARGO });
    expect(corto.avisos.some((a) => a.includes("4 s"))).toBe(true);
    expect(largo.avisos).toEqual([]);
  });
});
