import { describe, expect, test } from "bun:test";
import sharp from "sharp";
import { prepararLogotipo } from "./activos";
import { ErrorMarca, leerArchivo, leerCuerpoConTope } from "./http";
import { conCupoDeImagen, PROCESADOS_SIMULTANEOS, procesadosEnCurso } from "./procesado";

/**
 * Procesado de logotipos: un SVG no llega nunca a sharp (se rechaza en milisegundos, también el de `<use>` anidados que
 * rasterizado tardaba minutos), el procesado tiene cupo y tiempo máximo, y un JPEG de móvil se guarda derecho.
 */

function svgDeUsosAnidados(niveles: number): Uint8Array {
  const grupos = ['<g id="g0"><path d="M0 0h1v1z"/></g>'];
  for (let i = 1; i <= niveles; i++) {
    grupos.push(`<g id="g${i}">${Array.from({ length: 10 }, () => `<use href="#g${i - 1}"/>`).join("")}</g>`);
  }
  return new TextEncoder().encode(
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><defs>${grupos.join("")}</defs><use href="#g${niveles}"/></svg>`,
  );
}

const errorDe = (promesa: Promise<unknown>) =>
  promesa.then(
    () => null,
    (e: unknown) => e as ErrorMarca,
  );

describe("logotipos: solo raster, con cupo y tiempo máximo", () => {
  test("el SVG de 10⁵ instancias de apenas 1 KB (43 s rasterizado) se rechaza en milisegundos, antes de procesarlo, y no ocupa cupo", async () => {
    const bytes = svgDeUsosAnidados(5);
    expect(bytes.byteLength).toBeLessThan(1100);
    for (const enPng of [true, false]) {
      const inicio = performance.now();
      const error = await errorDe(prepararLogotipo(bytes, enPng));
      expect(performance.now() - inicio).toBeLessThan(50);
      expect(error).toBeInstanceOf(ErrorMarca);
      expect(error?.estado).toBe(415);
      expect(error?.message).toContain("Convierte tu logotipo a PNG (con fondo transparente) o a WebP");
    }
    expect(procesadosEnCurso()).toBe(0);
  });

  test("un SVG con entidades XML o de carácter también se rechaza al momento", async () => {
    for (const t of [
      '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY a "x"><!ENTITY b "&a;&a;&a;">]><svg xmlns="http://www.w3.org/2000/svg">&b;</svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill:&#117;rl(https://x.test/a)"/></svg>',
    ]) {
      const inicio = performance.now();
      const error = await errorDe(prepararLogotipo(new TextEncoder().encode(t), true));
      expect(performance.now() - inicio).toBeLessThan(50);
      expect(error?.message).toContain("no admite logotipos en SVG");
    }
  });

  test("un archivo con firma WebP falsa y un SVG de <use> anidados dentro no llega al lector de SVG y se rechaza en ms", async () => {
    const svg = svgDeUsosAnidados(5);
    const falso = new Uint8Array(12 + svg.byteLength);
    falso.set(new TextEncoder().encode("RIFF"), 0);
    new DataView(falso.buffer).setUint32(4, falso.byteLength - 8, true);
    falso.set(new TextEncoder().encode("WEBP"), 8);
    falso.set(svg, 12);
    const inicio = performance.now();
    const error = await errorDe(prepararLogotipo(falso, true));
    expect(performance.now() - inicio).toBeLessThan(500);
    expect(error).toBeInstanceOf(ErrorMarca);
    expect([415, 422]).toContain(error?.estado as number);
    // Y el lector de SVG de libvips está bloqueado en todo el proceso: ni un SVG de verdad se puede leer.
    await expect(sharp(Buffer.from(svg)).metadata()).rejects.toThrow();
    expect(procesadosEnCurso()).toBe(0);
  });

  test("un trabajo que lanza de forma síncrona también libera su hueco", async () => {
    const error = await errorDe(
      conCupoDeImagen(() => {
        throw new Error("fallo síncrono");
      }),
    );
    expect(error?.message).toBe("fallo síncrono");
    expect(procesadosEnCurso()).toBe(0);
  });

  test("con el cupo lleno, la siguiente imagen recibe un 503 con la causa al momento", async () => {
    const soltar: (() => void)[] = [];
    const ocupados = Array.from({ length: PROCESADOS_SIMULTANEOS }, () =>
      conCupoDeImagen(() => new Promise<void>((resolver) => soltar.push(resolver))),
    );
    expect(procesadosEnCurso()).toBe(PROCESADOS_SIMULTANEOS);
    const error = await errorDe(conCupoDeImagen(async () => "no debería ejecutarse"));
    expect(error?.estado).toBe(503);
    expect(error?.message).toContain("se están procesando otras imágenes");
    for (const s of soltar) s();
    await Promise.all(ocupados);
    expect(procesadosEnCurso()).toBe(0);
    expect(await conCupoDeImagen(async () => "ya hay sitio")).toBe("ya hay sitio");
  });

  test("un procesado que no termina corta la petición a su tiempo máximo y sigue contando hasta que acaba", async () => {
    let terminar = () => {};
    const inicio = performance.now();
    const error = await errorDe(conCupoDeImagen(() => new Promise<void>((r) => (terminar = r)), 50));
    expect(performance.now() - inicio).toBeLessThan(1000);
    expect(error?.estado).toBe(422);
    expect(error?.message).toContain("ha tardado más de");
    expect(procesadosEnCurso()).toBe(1);
    terminar();
    await new Promise((r) => setTimeout(r, 0));
    expect(procesadosEnCurso()).toBe(0);
  });

  test("un JPEG con orientación EXIF se guarda derecho y sin metadatos", async () => {
    const jpeg = await sharp({ create: { width: 80, height: 40, channels: 3, background: "#3d6bff" } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const logo = await prepararLogotipo(new Uint8Array(jpeg), false);
    expect([logo.mime, logo.ancho, logo.alto]).toEqual(["image/jpeg", 40, 80]);
    expect((await sharp(logo.datos).metadata()).orientation).toBeUndefined();
  });
});

describe("lectura de la subida con tope", () => {
  /** Flujo por trozos, sin `Content-Length`, que cuenta cuántos trozos se le han pedido. */
  function flujo(trozos: number, tamano: number) {
    let pedidos = 0;
    const cuerpo = new ReadableStream<Uint8Array>({
      pull(controlador) {
        if (pedidos >= trozos) return controlador.close();
        pedidos++;
        controlador.enqueue(new Uint8Array(tamano));
      },
    });
    return { cuerpo, pedidos: () => pedidos };
  }

  test("sin Content-Length, deja de leer en cuanto pasa del máximo y responde 413", async () => {
    const { cuerpo, pedidos } = flujo(1000, 64 * 1024); // 64 MB si se leyera entero
    const peticion = new Request("http://localhost/x", { method: "POST", body: cuerpo, duplex: "half" } as RequestInit);
    expect(peticion.headers.get("content-length")).toBeNull();
    const error = await errorDe(leerCuerpoConTope(peticion, 256 * 1024));
    expect(error?.estado).toBe(413);
    expect(pedidos()).toBeLessThan(10);
  });

  test("con Content-Length mayor que el máximo corta sin leer nada", async () => {
    const { cuerpo, pedidos } = flujo(10, 1024);
    const peticion = new Request("http://localhost/x", {
      method: "POST",
      body: cuerpo,
      headers: { "content-length": String(10 * 1024 * 1024) },
      duplex: "half",
    } as RequestInit);
    expect((await errorDe(leerCuerpoConTope(peticion, 1024)))?.estado).toBe(413);
    // El flujo solo prepara su primer trozo por su cuenta; no se lee nada más.
    expect(pedidos()).toBeLessThanOrEqual(1);
  });

  test("un formulario normal dentro del máximo se lee entero", async () => {
    const datos = new FormData();
    datos.set("archivo", new File([new Uint8Array(1000)], "logo.png", { type: "image/png" }));
    datos.set("familia", "Mi Fuente");
    const { archivo, campos } = await leerArchivo(
      new Request("http://localhost/x", { method: "POST", body: datos }),
      2000,
    );
    expect(archivo.size).toBe(1000);
    expect(campos.get("familia")).toBe("Mi Fuente");
  });
});
