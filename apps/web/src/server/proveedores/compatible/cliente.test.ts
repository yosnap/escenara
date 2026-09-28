import { describe, expect, test } from "bun:test";
import { detalleDeErrorAjeno, mensajeDeFalloDeProveedor } from "@/lib/diagnostico-proveedor";
import type { Buscador } from "../codigos";
import {
  ErrorCompatible,
  listarModelos,
  pedirChat,
  pedirVoz,
  textoDeUrlBase,
  transcribirAudioCompatible,
  validarUrlBase,
} from "./cliente";
import {
  CHAT_200,
  CHAT_401,
  CHAT_402,
  CHAT_429,
  MODELOS_200,
  respuestaDeAudio,
  respuestaGrabada,
  TRANSCRIPCION_200,
} from "./fixtures";

/**
 * Cliente de los servicios compatibles con la API de OpenAI (0.21.1). **No llama a nadie**: contesta con las
 * respuestas grabadas de NaN builders del 2026-09-28.
 *
 * Lo que fija, una por una:
 *
 * - la URL base **la escribe el usuario**, así que se comprueba aquí: solo https, sin credenciales, sin puertos
 *   raros y sin apuntar a una dirección interna;
 * - **la clave nunca sale en un error**, ni siquiera cuando el proveedor la repite dentro del suyo;
 * - de un error ajeno solo sobrevive lo que saca la lista blanca: cuántas peticiones simultáneas admite, cuándo
 *   se repone la cuota;
 * - `usage` se guarda: es lo único que mide cuánta cuota ha consumido una llamada que no cuesta créditos.
 */

const CLAVE = "sk-nan-clave-inventada-para-el-test";
const BASE = "https://api.nan.builders/v1";

describe("URL base: protección frente a SSRF", () => {
  test("acepta una https pública y le quita la barra final", () => {
    expect(textoDeUrlBase(validarUrlBase("https://api.nan.builders/v1/"))).toBe(BASE);
  });

  const rechazadas: [string, string][] = [
    ["http://api.nan.builders/v1", "http no basta: por ahí viaja la clave en claro"],
    ["https://127.0.0.1/v1", "la máquina local"],
    ["https://10.0.0.5/v1", "una red privada"],
    ["https://169.254.169.254/latest", "el servicio de metadatos de la nube"],
    ["https://[::1]/v1", "la máquina local por IPv6"],
    ["https://usuario:clave@api.nan.builders/v1", "credenciales incrustadas en la URL"],
    ["https://api.nan.builders:8321/v1", "un puerto que no es el estándar"],
    ["https://api.nan.builders/v1?token=abc", "una consulta pegada a la dirección"],
    ["file:///etc/passwd", "un esquema que no es http(s)"],
    ["no es una url", "texto que no es una dirección"],
  ];
  for (const [url, motivo] of rechazadas) {
    test(`rechaza ${motivo}`, () => {
      expect(() => validarUrlBase(url)).toThrow(ErrorCompatible);
    });
  }

  test("una dirección interna se rechaza también al llamar, no solo al guardarla", async () => {
    // Sin `buscar`: se recorre la comprobación de destino de verdad, con un resolvedor que devuelve una IP interna.
    await expect(
      listarModelos({ urlBase: BASE, clave: CLAVE, resolver: async () => ["192.168.1.10"] }),
    ).rejects.toThrow(ErrorCompatible);
  });
});

describe("la clave nunca sale en un error", () => {
  test("ni cuando el proveedor la repite dentro del suyo", async () => {
    const buscar: Buscador = async () => respuestaGrabada(CHAT_401, 401);
    const error = await pedirChat({
      urlBase: BASE,
      clave: CLAVE,
      modelo: "gemma4",
      instrucciones: "i",
      entrada: "e",
      buscar,
    })
      .then(() => null)
      .catch((e: unknown) => e as ErrorCompatible);
    expect(error).toBeInstanceOf(ErrorCompatible);
    const texto = `${error?.message} ${error?.detalle} ${error?.stack ?? ""}`;
    expect(texto).not.toContain(CLAVE);
    expect(texto).not.toContain("sk-nan-XXXXXXXXXXXXXXXX");
    expect(texto).not.toContain("is not recognised");
  });

  test("401 y 403 paran el proveedor entero; 429 y 402 no", async () => {
    const de = async (cuerpo: unknown, estado: number) =>
      (await pedirChat({
        urlBase: BASE,
        clave: CLAVE,
        modelo: "gemma4",
        instrucciones: "i",
        entrada: "e",
        buscar: async () => respuestaGrabada(cuerpo, estado),
      }).catch((e: unknown) => e)) as ErrorCompatible;
    expect((await de(CHAT_401, 401)).paraElProveedor).toBe(true);
    expect((await de(CHAT_401, 403)).paraElProveedor).toBe(true);
    expect((await de(CHAT_429, 429)).paraElProveedor).toBe(false);
    expect((await de(CHAT_402, 402)).paraElProveedor).toBe(false);
  });
});

describe("la causa concreta sí llega, saneada", () => {
  test("429: cuántas peticiones simultáneas admite ese modelo", () => {
    expect(detalleDeErrorAjeno(CHAT_429.error.message)).toBe("máximo 5 peticiones simultáneas");
  });

  test("402: cuándo se repone la cuota", () => {
    const detalle = detalleDeErrorAjeno(CHAT_402.error.message);
    expect(detalle).toContain("la cuota se repone el 2026-10-01");
    expect(detalle).toContain("la cuota del plan está agotada");
  });

  test("no se cuela texto libre del proveedor", () => {
    expect(detalleDeErrorAjeno("Something went terribly wrong in shard 7 at /srv/app/x.py")).toBe("");
  });

  test("el mensaje montado cuenta todos los intentos, con proveedor, modelo y causa", () => {
    const mensaje = mensajeDeFalloDeProveedor(
      "No se ha podido traducir tu texto al inglés",
      [
        {
          proveedor: "KIE.ai",
          modelo: "gpt-5-6-sol",
          codigo: "tiempo-agotado",
          cobro: "se-desconoce",
          detalle: "tras 90 s",
        },
        {
          proveedor: "NaN builders",
          modelo: "gemma4",
          codigo: "limite",
          cobro: "sin-cobro",
          detalle: "máximo 5 peticiones simultáneas",
        },
        {
          proveedor: "NaN builders",
          modelo: "deepseek-v4-flash",
          codigo: "sin-credito",
          cobro: "sin-cobro",
          detalle: "la cuota se repone el 2026-10-01",
        },
      ],
      "",
    );
    expect(mensaje).toContain("KIE.ai (gpt-5-6-sol) ha tardado demasiado en responder (tras 90 s)");
    expect(mensaje).toContain("No se sabe si te ha cobrado");
    expect(mensaje).toContain("NaN builders (gemma4)");
    expect(mensaje).toContain("máximo 5 peticiones simultáneas");
    expect(mensaje).toContain("NaN builders (deepseek-v4-flash)");
    expect(mensaje).toContain("la cuota se repone el 2026-10-01");
    // Y lo que está prohibido: el mensaje genérico de antes.
    expect(mensaje).not.toContain("Vuelve a intentarlo en un momento");
  });
});

describe("lectura de las respuestas grabadas", () => {
  test("GET /models devuelve los identificadores", async () => {
    const modelos = await listarModelos({
      urlBase: BASE,
      clave: CLAVE,
      buscar: async () => respuestaGrabada(MODELOS_200),
    });
    expect(modelos).toContain("gemma4");
    expect(modelos).toContain("glm5.3-flash");
    expect(modelos).toHaveLength(14);
  });

  test("POST /chat/completions devuelve el texto y los tokens de usage", async () => {
    let cuerpoEnviado: Record<string, unknown> = {};
    const buscar: Buscador = async (_url, init) => {
      cuerpoEnviado = JSON.parse(String(init.body)) as Record<string, unknown>;
      return respuestaGrabada(CHAT_200);
    };
    const respuesta = await pedirChat({
      urlBase: BASE,
      clave: CLAVE,
      modelo: "glm5.3-flash",
      instrucciones: "Traduce al inglés.",
      entrada: "en una azotea al amanecer",
      buscar,
    });
    expect(respuesta.texto).toBe("on a rooftop at dawn, looking at the camera");
    expect(respuesta.tokensEntrada).toBe(57);
    expect(respuesta.tokensSalida).toBe(433);
    // Las instrucciones las compone el servidor y van como `system`; el texto del usuario va aparte.
    expect(cuerpoEnviado.stream).toBe(false);
    expect(cuerpoEnviado.messages).toEqual([
      { role: "system", content: "Traduce al inglés." },
      { role: "user", content: "en una azotea al amanecer" },
    ]);
  });

  test("un 200 sin contenido utilizable no se da por bueno", async () => {
    const buscar: Buscador = async () => respuestaGrabada({ choices: [{ message: { content: "   " } }] });
    await expect(
      pedirChat({ urlBase: BASE, clave: CLAVE, modelo: "gemma4", instrucciones: "i", entrada: "e", buscar }),
    ).rejects.toThrow(ErrorCompatible);
  });
});

describe("audio: voz y transcripción con respuestas grabadas", () => {
  test("kokoro devuelve los bytes del audio y su tipo, y la petición lleva la voz elegida", async () => {
    let cuerpo: Record<string, unknown> = {};
    const buscar: Buscador = async (url, init) => {
      expect(url).toBe(`${BASE}/audio/speech`);
      cuerpo = JSON.parse(String(init.body)) as Record<string, unknown>;
      return respuestaDeAudio();
    };
    const voz = await pedirVoz({
      urlBase: BASE,
      clave: CLAVE,
      modelo: "kokoro",
      voz: "ef_dora",
      texto: "Buenos días.",
      velocidad: 1,
      buscar,
    });
    expect(voz.mime).toBe("audio/mpeg");
    expect(voz.audio.byteLength).toBeGreaterThan(0);
    expect(cuerpo).toEqual({
      model: "kokoro",
      input: "Buenos días.",
      voice: "ef_dora",
      response_format: "mp3",
      speed: 1,
    });
  });

  test("un audio vacío no se da por bueno: sería una escena muda sin decirlo", async () => {
    const buscar: Buscador = async () => new Response(new Uint8Array(), { status: 200 });
    await expect(
      pedirVoz({ urlBase: BASE, clave: CLAVE, modelo: "kokoro", voz: "ef_dora", texto: "hola", buscar }),
    ).rejects.toThrow(ErrorCompatible);
  });

  test("whisper devuelve los segmentos con sus tiempos, en multipart y pidiendo verbose_json", async () => {
    let campos: Record<string, string> = {};
    const buscar: Buscador = async (url, init) => {
      expect(url).toBe(`${BASE}/audio/transcriptions`);
      const formulario = init.body as FormData;
      campos = {
        model: String(formulario.get("model")),
        response_format: String(formulario.get("response_format")),
      };
      // La cabecera del multipart la pone `fetch`: si la pusiéramos nosotros, faltaría el separador.
      expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
      return respuestaGrabada(TRANSCRIPCION_200);
    };
    const segmentos = await transcribirAudioCompatible({
      urlBase: BASE,
      clave: CLAVE,
      modelo: "whisper",
      audio: new Blob([new Uint8Array([1, 2, 3])]),
      nombre: "audio.mp3",
      buscar,
    });
    expect(campos).toEqual({ model: "whisper", response_format: "verbose_json" });
    expect(segmentos).toHaveLength(2);
    expect(segmentos[0]).toEqual({ inicio: 0, fin: 2.1, texto: "Buenos días," });
    expect(segmentos[1]?.fin).toBe(4.02);
  });

  test("un segmento con tiempos imposibles se descarta en lugar de colocar texto donde nadie habló", async () => {
    const buscar: Buscador = async () =>
      respuestaGrabada({
        segments: [
          { start: 5, end: 1, text: "al revés" },
          { start: 0, end: 1, text: "bien" },
        ],
      });
    const segmentos = await transcribirAudioCompatible({
      urlBase: BASE,
      clave: CLAVE,
      modelo: "whisper",
      audio: new Blob([new Uint8Array([1])]),
      nombre: "a.mp3",
      buscar,
    });
    expect(segmentos).toEqual([{ inicio: 0, fin: 1, texto: "bien" }]);
  });
});
