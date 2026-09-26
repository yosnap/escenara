import { afterAll, describe, expect, test } from "bun:test";
import { descargarUrl, esIpPublica, nombreDesdeUrl, validarUrl } from "./descarga-url";

describe("esIpPublica", () => {
  test.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.20.0.5",
    "192.168.1.11",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "::",
    "fd00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::7f00:1",
    "fec0::1",
    "2002:7f00:1::",
    "2001:0:4136:e378::1",
    "100::1",
    "192.88.99.1",
    "no-es-una-ip",
  ])("bloquea %s", (ip) => {
    expect(esIpPublica(ip)).toBe(false);
  });

  test.each(["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"])("admite %s", (ip) => {
    expect(esIpPublica(ip)).toBe(true);
  });
});

describe("validarUrl", () => {
  test.each([
    ["ftp://ejemplo.com/a.png", "http o https"],
    ["file:///etc/passwd", "http o https"],
    ["https://usuario:clave@ejemplo.com/a.png", "usuario"],
    ["https://ejemplo.com:8080/a.png", "puertos"],
    ["no es una url", "no es válida"],
  ])("rechaza %s", (url, motivo) => {
    expect(() => validarUrl(url)).toThrow(motivo);
  });

  test("admite http y https con puertos estándar", () => {
    expect(validarUrl(" https://ejemplo.com/foto.jpg ").hostname).toBe("ejemplo.com");
  });
});

describe("nombreDesdeUrl", () => {
  test.each([
    ["https://e.com/fotos/playa%20azul.jpg", "playa azul.jpg"],
    ["https://e.com/x/..%2f..%2fetc%2fpasswd", "etc-passwd"],
    ["https://e.com/%zz.png", "zz.png"],
    ["https://e.com/", "e.com"],
  ])("%s → %s", (url, nombre) => {
    expect(nombreDesdeUrl(new URL(url))).toBe(nombre);
  });
});

describe("descargarUrl", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  // Servidor local en un puerto libre; solo aquí se permiten ese puerto y la IP local.
  const servidor = Bun.serve({
    port: 0,
    fetch(peticion) {
      const ruta = new URL(peticion.url).pathname;
      if (ruta === "/foto.png") return new Response(png, { headers: { "Content-Type": "image/png" } });
      if (ruta === "/grande") return new Response(new Uint8Array(5000));
      if (ruta === "/a-privada") return Response.redirect("http://10.0.0.1/secreto", 302);
      if (ruta === "/bucle") return Response.redirect(`${peticion.url}`, 302);
      if (ruta === "/eco")
        return Response.json({ host: peticion.headers.get("host"), ua: peticion.headers.get("user-agent") });
      if (ruta === "/pagina") return new Response("<html></html>", { headers: { "Content-Type": "text/html" } });
      return new Response("no", { status: 404 });
    },
  });
  afterAll(() => servidor.stop(true));

  const base = `http://127.0.0.1:${servidor.port}`;
  const soloLocal = (ip: string) => ip === "127.0.0.1";
  const descargar = (ruta: string, limite = 10_000) =>
    descargarUrl(`${base}${ruta}`, limite, soloLocal, { puertosPermitidos: [String(servidor.port)] });

  test("descarga un archivo con su nombre, tipo y origen", async () => {
    const { archivo, origen } = await descargar("/foto.png");
    expect(archivo.name).toBe("foto.png");
    expect(archivo.type).toBe("image/png");
    expect(new Uint8Array(await archivo.arrayBuffer())).toEqual(png);
    expect(origen).toBe(`${base}/foto.png`);
  });

  test("el origen guardado omite la consulta (p. ej., tokens de enlaces firmados)", async () => {
    const { origen } = await descargar("/foto.png?firma=secreta");
    expect(origen).toBe(`${base}/foto.png`);
  });

  test("corta la descarga al superar el límite", async () => {
    await expect(descargar("/grande", 1000)).rejects.toThrow("tamaño máximo");
  });

  test("vuelve a comprobar la IP tras una redirección", async () => {
    await expect(descargar("/a-privada")).rejects.toThrow("no permitida");
  });

  test("limita las redirecciones", async () => {
    await expect(descargar("/bucle")).rejects.toThrow("demasiadas veces");
  });

  test("conecta a la IP comprobada y envía el dominio en la cabecera Host", async () => {
    // `fijado.test` no existe en el DNS real: solo el resolvedor del test lo conoce.
    const { archivo } = await descargarUrl(`http://fijado.test:${servidor.port}/eco`, 10_000, soloLocal, {
      puertosPermitidos: [String(servidor.port)],
      resolver: async () => ["127.0.0.1"],
    });
    const eco = JSON.parse(await archivo.text());
    expect(eco.host).toBe(`fijado.test:${servidor.port}`);
    expect(eco.ua).toContain("Escenara");
  });

  test("si una IP no responde, prueba la siguiente", async () => {
    // 240.0.0.1 no responde y agota su plazo de conexión; 127.0.0.1 es el servidor del test.
    const { archivo } = await descargarUrl(`http://varias.test:${servidor.port}/foto.png`, 10_000, () => true, {
      puertosPermitidos: [String(servidor.port)],
      resolver: async () => ["240.0.0.1", "127.0.0.1"],
    });
    expect(archivo.size).toBe(png.byteLength);
  }, 15_000);

  test("rechaza un dominio si cualquiera de sus IP es interna", async () => {
    await expect(
      descargarUrl("http://mixto.test/foto.png", 10_000, undefined, { resolver: async () => ["8.8.8.8", "127.0.0.1"] }),
    ).rejects.toThrow("no permitida");
  });

  test("explica que una página web no es un archivo", async () => {
    await expect(descargar("/pagina")).rejects.toThrow("página web");
  });

  test("informa de las respuestas de error", async () => {
    await expect(descargar("/no-existe")).rejects.toThrow("404");
  });

  test("con la comprobación por defecto bloquea el propio servidor", async () => {
    await expect(descargarUrl("http://127.0.0.1/foto.png", 10_000)).rejects.toThrow("no permitida");
    await expect(descargarUrl("http://localhost/foto.png", 10_000)).rejects.toThrow("no permitida");
  });
});
