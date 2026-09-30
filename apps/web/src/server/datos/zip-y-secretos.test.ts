import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { filtroDeLaUrl } from "./historial";
import { pareceSecreto, retirarSecretos, secretosDeLaInstalacion } from "./secretos";
import { ErrorZip, EscritorZip, esNombreSeguro, leerZip } from "./zip";

/** Destino en memoria para el escritor. */
function enMemoria() {
  const trozos: Uint8Array[] = [];
  return {
    destino: { write: (d: Uint8Array) => trozos.push(d.slice()) },
    bytes: () => {
      const total = trozos.reduce((n, t) => n + t.byteLength, 0);
      const todo = new Uint8Array(total);
      let p = 0;
      for (const t of trozos) {
        todo.set(t, p);
        p += t.byteLength;
      }
      return todo;
    },
  };
}

describe("ZIP sin dependencias", () => {
  test("lo que se escribe se lee igual, con nombres en UTF-8 y su CRC", async () => {
    const m = enMemoria();
    const zip = new EscritorZip(m.destino);
    await zip.agregar("proyecto.json", new TextEncoder().encode('{"titulo":"Canción de otoño"}'));
    await zip.agregar("medios/escena-01/fotograma.png", new Uint8Array([1, 2, 3, 4]));
    const tamano = await zip.cerrar();
    const bytes = m.bytes();
    expect(tamano).toBe(bytes.byteLength);
    const archivos = leerZip(bytes);
    expect([...archivos.keys()]).toEqual(["proyecto.json", "medios/escena-01/fotograma.png"]);
    expect(new TextDecoder().decode(archivos.get("proyecto.json"))).toContain("Canción");
    expect([...(archivos.get("medios/escena-01/fotograma.png") ?? [])]).toEqual([1, 2, 3, 4]);
  });

  test("lo descomprime la herramienta del sistema, si la hay", async () => {
    const unzip = Bun.which("unzip");
    if (!unzip) return;
    const carpeta = await mkdtemp(path.join(tmpdir(), "zip-prueba-"));
    try {
      const ruta = path.join(carpeta, "p.zip");
      const destino = Bun.file(ruta).writer();
      const zip = new EscritorZip(destino);
      await zip.agregar("LEEME.md", new TextEncoder().encode("# Hola\n"));
      await zip.cerrar();
      await destino.end();
      const prueba = Bun.spawnSync([unzip, "-t", ruta]);
      expect(prueba.exitCode).toBe(0);
    } finally {
      await rm(carpeta, { recursive: true, force: true });
    }
  });

  test("rechaza rutas peligrosas y archivos repetidos", async () => {
    for (const malo of ["/etc/passwd", "../fuera", "medios/../x", "a\\b", "a//b", "con\u0000nulo", ""]) {
      expect(esNombreSeguro(malo)).toBe(false);
    }
    const zip = new EscritorZip(enMemoria().destino);
    await zip.agregar("a.txt", new Uint8Array([1]));
    expect(zip.agregar("a.txt", new Uint8Array([2]))).rejects.toBeInstanceOf(ErrorZip);
    expect(zip.agregar("../a.txt", new Uint8Array([2]))).rejects.toBeInstanceOf(ErrorZip);
  });
});

describe("filtro de secretos del texto exportado", () => {
  test("retira los valores exactos de la instalación y lo que tiene forma de credencial", () => {
    const secretos = secretosDeLaInstalacion({
      DATABASE_URL: "postgresql://u:contrasena-larga-de-bd@localhost:5432/x",
      S3_ENDPOINT: "http://localhost:9000",
      S3_REGION: "us-east-1",
      S3_BUCKET: "b",
      S3_ACCESS_KEY_ID: "acceso-del-almacen",
      S3_SECRET_ACCESS_KEY: "secreto-del-almacen-muy-largo",
      BETTER_AUTH_SECRET: "secreto-de-sesion-0123456789",
    });
    const texto = [
      "Guion normal con la palabra secreto y una contraseña olvidada.",
      "secreto-del-almacen-muy-largo",
      "secreto-de-sesion-0123456789",
      "Authorization: Bearer eyJhbGciOi.abcdef",
      "https://s3/x?X-Amz-Signature=abcdef123&X-Amz-Credential=AKIA",
      "v1.clave1.aaaaaaaaaaaa.bbbbbbbbbbbb.cccccccccccc",
      "sk-proj-0123456789abcdefghij",
      "api_key=abcdef123456",
    ].join("\n");
    const { texto: limpio, retirados } = retirarSecretos(texto, secretos);
    expect(limpio).toContain("Guion normal con la palabra secreto y una contraseña olvidada.");
    for (const fuera of [
      "secreto-del-almacen",
      "secreto-de-sesion",
      "Bearer",
      "X-Amz",
      "v1.clave1",
      "sk-proj",
      "api_key=",
    ]) {
      expect(limpio).not.toContain(fuera);
    }
    expect(retirados).toBeGreaterThanOrEqual(7);
  });
});

describe("qué parece un secreto", () => {
  test("una palabra corriente no; una clave, un JWT o una cadena larga de alta entropía sí", () => {
    const secretos = secretosDeLaInstalacion({
      DATABASE_URL: "postgresql://escenara:escenara@localhost:5432/escenara",
      S3_ENDPOINT: "http://localhost:9000",
      S3_REGION: "us-east-1",
      S3_BUCKET: "escenara",
      S3_ACCESS_KEY_ID: "escenara",
      S3_SECRET_ACCESS_KEY: "contrasena",
    });
    expect(secretos).not.toContain("escenara");
    expect(secretos).not.toContain("contrasena");
    expect(pareceSecreto("escenara")).toBe(false);
    expect(pareceSecreto("v047localsecreto")).toBe(true);
    const texto =
      "Guion de escenara. eyJhbGciOiJIUzI1.eyJzdWIiOjEyMzQ1Njc4.c2lnbmF0dXJlZmFrZQ y a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0";
    const { texto: limpio } = retirarSecretos(texto, secretos);
    expect(limpio).toContain("Guion de escenara.");
    expect(limpio).not.toContain("eyJhbGci");
    expect(limpio).not.toContain("a1b2c3d4e5f6");
  });
});

describe("filtros del historial desde la URL", () => {
  test("solo acepta valores conocidos; lo demás se ignora", () => {
    expect(filtroDeLaUrl({ tipo: "trabajo", mes: "2026-09", pagina: "3" })).toEqual({
      tipo: "trabajo",
      mes: "2026-09",
      proyectoId: null,
      pagina: 3,
    });
    expect(filtroDeLaUrl({ tipo: "'; drop table", mes: "2026-13", proyecto: "x", pagina: "-1" })).toEqual({
      tipo: null,
      mes: null,
      proyectoId: null,
      pagina: 1,
    });
  });
});
