import { describe, expect, test } from "bun:test";
import { segmentosDesdeMarcas } from "@/lib/voz";
import { ErrorProveedor } from "../contrato";
import { adaptadorElevenLabs } from "./adaptador";
import { cuerpoDeVoz, leerAlineacion } from "./cliente";

/**
 * Adaptador de ElevenLabs (0.21.0) contra **respuestas grabadas**: ninguna prueba llama a la API, porque cada
 * llamada de verdad cuesta créditos del plan de alguien.
 *
 * Lo que se graba es la forma exacta que devolvió la API real el 2026-09-28 con la clave del propietario:
 * `audio_base64`, `alignment`, `normalized_alignment` y las cabeceras `character-cost` y `request-id`.
 */

const PARAMETROS = { estabilidad: 0.5, similitud: 0.75, estilo: 0, velocidad: 1 };
const VOZ = "EXAVITQu4vr4xnSDxMaL";
const MODELO = "eleven_multilingual_v2";

/** MP3 mínimo con cabecera ID3, en base64: es lo que devuelve el campo `audio_base64`. */
const AUDIO = Buffer.from([...new TextEncoder().encode("ID3"), 3, 0, 0, 0, 0, 0, 0, ...new Uint8Array(32)]).toString(
  "base64",
);

/** Alineación tal como la devuelve el proveedor: una entrada por carácter en las tres listas. */
function alineacionDe(texto: string) {
  const caracteres = [...texto];
  return {
    characters: caracteres,
    character_start_times_seconds: caracteres.map((_, i) => Math.round(i * 0.05 * 100) / 100),
    character_end_times_seconds: caracteres.map((_, i) => Math.round((i + 1) * 0.05 * 100) / 100),
  };
}

const TEXTO = "Hola. Adiós.";

function respuestaGrabada(cuerpo: unknown, estado = 200, cabeceras: Record<string, string> = {}) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { "Content-Type": "application/json", ...cabeceras },
  });
}

/** Proveedor simulado que además guarda lo que se le mandó, para poder comprobar el cuerpo exacto. */
function proveedor(respuesta: () => Response) {
  const visto: { url: string; cuerpo: Record<string, unknown> }[] = [];
  const buscar = async (url: string, opciones: RequestInit) => {
    visto.push({ url, cuerpo: JSON.parse(String(opciones.body ?? "{}")) });
    return respuesta();
  };
  return { buscar, visto };
}

const peticion = (buscar: ReturnType<typeof proveedor>["buscar"]) => ({
  clave: "sk_clave-de-elevenlabs-inventada-aaaa",
  modelo: MODELO,
  entrada: { texto: TEXTO, voz: VOZ, parametros: PARAMETROS },
  buscar,
});

describe("cuerpo de la petición", () => {
  test("lleva los campos documentados y el idioma fijo en español", () => {
    expect(cuerpoDeVoz(TEXTO, MODELO, PARAMETROS)).toEqual({
      text: TEXTO,
      model_id: MODELO,
      language_code: "es",
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, speed: 1 },
    });
  });
});

describe("generar voz", () => {
  test("devuelve el audio, el coste real y las marcas en la misma llamada", async () => {
    const { buscar, visto } = proveedor(() =>
      respuestaGrabada(
        { audio_base64: AUDIO, alignment: alineacionDe(TEXTO), normalized_alignment: alineacionDe(TEXTO) },
        200,
        { "character-cost": "22", "request-id": "req_abc123" },
      ),
    );
    const pedida = await adaptadorElevenLabs.generarVoz?.(peticion(buscar));
    expect(pedida?.taskId).toBe("req_abc123");
    // Síncrono: el resultado viene en la misma respuesta, no hay tarea que consultar.
    expect(pedida?.inmediata?.mime).toBe("audio/mpeg");
    expect(pedida?.inmediata?.audio.byteLength).toBeGreaterThan(0);
    // El coste es el que informa el proveedor, no la estimación.
    expect(pedida?.inmediata?.creditosInformados).toBe(22);
    expect(pedida?.inmediata?.marcas?.caracteres).toHaveLength(TEXTO.length);

    // La voz va en la ruta y el formato en la consulta, tal como se comprobó contra la API real.
    expect(visto[0]?.url).toBe(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOZ}/with-timestamps?output_format=mp3_44100_128`,
    );
    expect(visto[0]?.cuerpo.model_id).toBe(MODELO);
  });

  test("sin marcas utilizables no se inventa ninguna", async () => {
    const { buscar } = proveedor(() =>
      respuestaGrabada({ audio_base64: AUDIO, alignment: { characters: ["a"], character_start_times_seconds: [0] } }),
    );
    const pedida = await adaptadorElevenLabs.generarVoz?.(peticion(buscar));
    expect(pedida?.inmediata?.marcas).toBeNull();
    // Y sin `character-cost` no se inventa un coste: lo apunta el cierre con la estimación.
    expect(pedida?.inmediata?.creditosInformados).toBeNull();
  });

  test("una clave rechazada sale como rechazo probado, así que se sabe que no ha cobrado", async () => {
    const { buscar } = proveedor(() => respuestaGrabada({ detail: "invalid api key" }, 401));
    const fallo = await adaptadorElevenLabs.generarVoz?.(peticion(buscar)).catch((e: unknown) => e);
    expect(fallo).toBeInstanceOf(ErrorProveedor);
    expect((fallo as ErrorProveedor).codigo).toBe("rechazada");
    expect((fallo as ErrorProveedor).rechazoProbado).toBe(true);
  });

  test("un error interno del proveedor NO prueba que no haya cobrado", async () => {
    const { buscar } = proveedor(() => respuestaGrabada({ detail: "internal" }, 500));
    const fallo = (await adaptadorElevenLabs.generarVoz?.(peticion(buscar)).catch((e: unknown) => e)) as ErrorProveedor;
    expect(fallo.codigo).toBe("error-proveedor");
    expect(fallo.rechazoProbado).toBe(false);
  });

  test("un 200 sin audio no se da por bueno", async () => {
    const { buscar } = proveedor(() => respuestaGrabada({ alignment: alineacionDe(TEXTO) }));
    const fallo = (await adaptadorElevenLabs.generarVoz?.(peticion(buscar)).catch((e: unknown) => e)) as ErrorProveedor;
    expect(fallo.codigo).toBe("respuesta-inesperada");
  });

  test("una voz con una forma que no es la suya no se envía: iría en la ruta", async () => {
    const { buscar, visto } = proveedor(() => respuestaGrabada({ audio_base64: AUDIO }));
    const fallo = (await adaptadorElevenLabs
      .generarVoz?.({ ...peticion(buscar), entrada: { texto: TEXTO, voz: "../../otra", parametros: PARAMETROS } })
      .catch((e: unknown) => e)) as ErrorProveedor;
    expect(fallo.codigo).toBe("formato");
    expect(visto).toHaveLength(0);
  });
});

describe("lo que este adaptador no hace", () => {
  test("solo declara la capacidad de voz", () => {
    expect(adaptadorElevenLabs.capacidades).toEqual(["tts"]);
    expect(adaptadorElevenLabs.admite("tts")).toBe(true);
    expect(adaptadorElevenLabs.admite("image_to_video")).toBe(false);
  });

  test("consultar no vuelve a llamar: dice que no se sabe y deja el trabajo en revisión", async () => {
    const tarea = await adaptadorElevenLabs.consultar({ clave: "x", taskId: "req_abc123", buscar: fetch });
    // `desconocido` retiene la reserva y **no** reenvía nada: volver a llamar sería pagar dos veces.
    expect(tarea.estadoPropio).toBe("desconocido");
    expect(tarea.urls).toEqual([]);
  });

  test("pedirle una imagen o un vídeo falla con su motivo, no devuelve algo inventado", async () => {
    for (const metodo of ["generarImagen", "generarVideo"] as const) {
      const fallo = await Promise.resolve()
        .then(() => adaptadorElevenLabs[metodo](peticion(fetch as never)))
        .catch((e: unknown) => e);
      expect(fallo).toBeInstanceOf(ErrorProveedor);
      expect((fallo as ErrorProveedor).message).toContain("solo genera voz");
    }
  });

  test("montar la entrada sin voz fijada falla en lugar de inventarse un timbre", () => {
    expect(() => adaptadorElevenLabs.montarEntrada({} as never, { escena: "", dialogo: TEXTO, urls: [] })).toThrow(
      ErrorProveedor,
    );
  });
});

describe("marcas por carácter", () => {
  test("los tiempos de cada frase son los medidos, no un reparto", () => {
    const marcas = leerAlineacion(alineacionDe(TEXTO));
    expect(marcas).not.toBeNull();
    if (!marcas) return;
    const segmentos = segmentosDesdeMarcas({
      caracteres: marcas.caracteres,
      inicios: marcas.inicios,
      finales: marcas.finales,
    });
    expect(segmentos.map((s) => s.texto)).toEqual(["Hola.", "Adiós."]);
    // «Hola.» son los cinco primeros caracteres: de 0 a 0,25 s con el paso grabado de 0,05 s.
    expect(segmentos[0]?.desde).toBe(0);
    expect(segmentos[0]?.hasta).toBe(0.25);
    // Y la segunda empieza donde empieza su primera letra, no donde acaba la anterior.
    expect(segmentos[1]?.desde).toBeGreaterThan(0.25);
  });

  test("unas listas que no cuadran se descartan enteras", () => {
    expect(leerAlineacion({ characters: ["a", "b"], character_start_times_seconds: [0] })).toBeNull();
    expect(leerAlineacion(null)).toBeNull();
    expect(segmentosDesdeMarcas({ caracteres: ["a"], inicios: [0], finales: [] })).toEqual([]);
  });
});
