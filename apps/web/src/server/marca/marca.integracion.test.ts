import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import sharp from "sharp";
import type { DocumentoMarca } from "@/lib/marca-esquema";
import type { ActivoVista, EstadoMarcaVista, KitVista, VersionMarcaVista } from "@/lib/marca-vista";

/**
 * **Marca de la instalación y kit del creador** contra PostgreSQL y el almacenamiento S3 locales. Ningún test llama a
 * ningún proveedor.
 *
 * Comprueba, uno por uno: un JSON inválido no se publica y la anterior sigue intacta; la
 * publicación es atómica (un fallo a mitad no deja nada a medias); el contraste que no llega bloquea; revertir es un
 * clic; solo la administración cambia la marca y cada usuario solo su kit; los archivos válidos entran y los inválidos o
 * maliciosos se rechazan con su causa; y lo que se sirve lleva su tipo real y `nosniff`.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);
process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  // La marca es de toda la instalación: esta suite nunca corre en la base de desarrollo.
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_marca");
}

const rutaMarca = await import("@/app/api/admin/marca/route");
const rutaPublicar = await import("@/app/api/admin/marca/publicar/route");
const rutaRetirar = await import("@/app/api/admin/marca/retirar/route");
const rutaRevertir = await import("@/app/api/admin/marca/versiones/[id]/revertir/route");
const rutaSubir = await import("@/app/api/admin/marca/activos/route");
const rutaActivo = await import("@/app/api/marca/activos/[id]/route");
const rutaManifiesto = await import("@/app/api/marca/manifest/route");
const rutaKit = await import("@/app/api/cuenta/kit/route");
const rutaLogoKit = await import("@/app/api/cuenta/kit/logotipo/route");
const { exigirBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { brandAssets, brandVersions, rateLimits } = await import("../db/esquema");
const { eq } = await import("drizzle-orm");
const { marcaAplicada, olvidarMarcaAplicada } = await import("./publicada");
const { baseDeLaInstalacion, metadatosDeLaMarca, METADATOS_DE_ESCENARA } = await import("./metadatos");
const { guardarAjustes, leerAjustes } = await import("../ajustes");
const { conCupoDeImagen, PROCESADOS_SIMULTANEOS } = await import("./procesado");
const { barrerLogosHuerfanosDelKit } = await import("./kit");
const { publicarBorrador } = await import("./instalacion");
const { generarDerivados } = await import("./activos");
const { documentoBase } = await import("@/lib/marca-base");
const { leerObjeto } = await import("../almacenamiento");

type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

const pedir = (s: Sesion | null, url: string, metodo = "GET", cuerpo?: unknown) =>
  new Request(`http://localhost${url}`, {
    method: metodo,
    headers: {
      ...(s ? { cookie: s.cookie } : {}),
      ...(metodo === "GET" ? {} : { origin: "http://localhost" }),
      ...(cuerpo === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });

function subida(s: Sesion, url: string, archivo: File, campos: Record<string, string> = {}) {
  const datos = new FormData();
  datos.set("archivo", archivo);
  for (const [k, v] of Object.entries(campos)) datos.set(k, v);
  return new Request(`http://localhost${url}`, {
    method: "POST",
    headers: { cookie: s.cookie, origin: "http://localhost" },
    body: datos,
  });
}

const png = async (ancho: number, alto: number, color = "#3d6bff") =>
  new File(
    [
      await sharp({ create: { width: ancho, height: alto, channels: 4, background: color } })
        .png()
        .toBuffer(),
    ],
    "logo.png",
    {
      type: "image/png",
    },
  );
/** SVG de la revisión: cada nivel repite 10 veces el anterior. Con 5 niveles, 10⁵ instancias en apenas 1 KB. */
const usosAnidados = (niveles: number) => {
  const grupos = ['<g id="g0"><path d="M0 0h1v1z"/></g>'];
  for (let i = 1; i <= niveles; i++) {
    grupos.push(`<g id="g${i}">${Array.from({ length: 10 }, () => `<use href="#g${i - 1}"/>`).join("")}</g>`);
  }
  return `<defs>${grupos.join("")}</defs><use href="#g${niveles}"/>`;
};
const svg = (cuerpo: string) =>
  new File(
    [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60" width="120" height="60">${cuerpo}</svg>`],
    "logo.svg",
    {
      type: "image/svg+xml",
    },
  );
const manrope = async () =>
  new File(
    [await Bun.file(path.resolve(import.meta.dirname, "../../fonts/manrope-latin-wght-normal.woff2")).arrayBuffer()],
    "mi-fuente.woff2",
    { type: "font/woff2" },
  );

describe.skipIf(!hayBaseDeDatos)("marca de la instalación y kit del creador", () => {
  let admin: Sesion;
  let ana: Sesion;
  let beto: Sesion;

  beforeAll(async () => {
    exigirBaseDeDatosDePrueba("escenara_pruebas_marca");
    await aplicarMigraciones();
    [admin, ana, beto] = await Promise.all([
      crearSesionDePrueba("admin"),
      crearSesionDePrueba("user"),
      crearSesionDePrueba("user"),
    ]);
  });

  afterAll(async () => {
    exigirBaseDeDatosDePrueba("escenara_pruebas_marca");
    await db().delete(brandVersions);
    await Promise.all([admin?.borrar(), ana?.borrar(), beto?.borrar()]);
    olvidarMarcaAplicada();
  });

  beforeEach(async () => {
    exigirBaseDeDatosDePrueba("escenara_pruebas_marca");
    await db().delete(brandVersions);
    await db().delete(rateLimits);
    olvidarMarcaAplicada();
  });

  const estado = async () =>
    (await (await rutaMarca.GET(pedir(admin, "/api/admin/marca"), undefined)).json()) as EstadoMarcaVista;

  async function guardar(documento: unknown, activos: unknown = { logos: {}, fuentes: [] }, s: Sesion = admin) {
    const r = await rutaMarca.PUT(
      pedir(s, "/api/admin/marca", "PUT", { documento, activos, notas: "prueba" }),
      undefined,
    );
    return {
      estado: r.status,
      datos: (await r.json()) as { borrador?: VersionMarcaVista; error?: string; errores?: { campo: string }[] },
    };
  }

  async function publicar(s: Sesion = admin) {
    const r = await rutaPublicar.POST(pedir(s, "/api/admin/marca/publicar", "POST"), undefined);
    return {
      estado: r.status,
      datos: (await r.json()) as {
        publicada?: VersionMarcaVista;
        error?: string;
        bloqueos?: { delante: string; detras: string }[];
      },
    };
  }

  async function subirLogo(archivo: File, s: Sesion = admin) {
    const r = await rutaSubir.POST(subida(s, "/api/admin/marca/activos?tipo=logotipo", archivo), undefined);
    return { estado: r.status, datos: (await r.json()) as { activo?: ActivoVista; error?: string } };
  }

  const conColor = (color: string): DocumentoMarca => {
    const doc = structuredClone(documentoBase());
    doc.theme.light.primary = color;
    doc.theme.light.focus = color;
    return doc;
  };

  // ── Sin marca publicada, todo es lo de siempre ────────────────────────────────────────────────────────────

  test("sin marca publicada no se aplica nada: ni CSS, ni metadatos, ni iconos distintos, ni manifiesto", async () => {
    expect(await marcaAplicada()).toBeNull();
    expect(metadatosDeLaMarca(null)).toEqual(METADATOS_DE_ESCENARA);
    expect(METADATOS_DE_ESCENARA.title).toEqual({
      default: "Escenara · Da vida a cada escena",
      template: "%s · Escenara",
    });
    expect((await rutaManifiesto.GET()).status).toBe(404);
  });

  // ── Permisos ──────────────────────────────────────────────────────────────────────────────────────────────

  test("solo la administración ve y cambia la marca de la instalación; sin sesión, 401", async () => {
    expect((await rutaMarca.GET(pedir(null, "/api/admin/marca"), undefined)).status).toBe(401);
    expect((await rutaMarca.GET(pedir(ana, "/api/admin/marca"), undefined)).status).toBe(403);
    expect((await guardar(documentoBase(), undefined, ana)).estado).toBe(403);
    expect((await publicar(ana)).estado).toBe(403);
    expect((await subirLogo(await png(64, 64), ana)).estado).toBe(403);
    expect((await rutaRetirar.POST(pedir(ana, "/api/admin/marca/retirar", "POST"), undefined)).status).toBe(403);
    const id = crypto.randomUUID();
    expect(
      (await rutaRevertir.POST(pedir(ana, `/api/admin/marca/versiones/${id}/revertir`, "POST"), ctx(id))).status,
    ).toBe(403);
    expect((await rutaMarca.DELETE(pedir(ana, "/api/admin/marca", "DELETE"), undefined)).status).toBe(403);
    expect(await db().select().from(brandVersions)).toEqual([]);
  });

  test("una escritura sin origen o desde otro sitio se rechaza aunque la sesión sea de administración", async () => {
    const sinOrigen = new Request("http://localhost/api/admin/marca/publicar", {
      method: "POST",
      headers: { cookie: admin.cookie },
    });
    expect((await rutaPublicar.POST(sinOrigen, undefined)).status).toBe(403);
    const ajeno = new Request("http://localhost/api/admin/marca/publicar", {
      method: "POST",
      headers: { cookie: admin.cookie, origin: "https://otro.test" },
    });
    expect((await rutaPublicar.POST(ajeno, undefined)).status).toBe(403);
  });

  // ── Borrador, validación y publicación ───────────────────────────────────────────────────────────────────

  test("un JSON inválido no se guarda ni se publica, dice qué campo falla y la versión anterior sigue intacta", async () => {
    expect((await guardar(conColor("#1D47C4"))).estado).toBe(200);
    const primera = await publicar();
    expect(primera.estado).toBe(200);
    const antes = await db().select().from(brandVersions);

    const malo = structuredClone(documentoBase()) as unknown as Record<string, Record<string, Record<string, string>>>;
    (malo.theme as Record<string, Record<string, string>>).dark = {
      ...malo.theme?.dark,
      text: "#fff; } body { color: red",
    };
    (malo.typography as unknown as Record<string, string>).family = 'Inter"; } *{';
    const r = await guardar(malo);
    expect(r.estado).toBe(422);
    expect(r.datos.errores?.map((e) => e.campo).sort()).toEqual(["theme.dark.text", "typography.family"]);
    expect(r.datos.error).toContain("sigue la versión anterior");
    expect(await db().select().from(brandVersions)).toEqual(antes);
    expect((await marcaAplicada())?.css).toContain("--primary: #1D47C4;");
  });

  test("publicar aplica la marca en la siguiente página: CSS propio con :root:root, título y nada de borrador", async () => {
    expect((await guardar(conColor("#1D47C4"))).estado).toBe(200);
    const { estado: e, datos } = await publicar();
    expect(e).toBe(200);
    expect(datos.publicada?.estado).toBe("publicada");
    const marca = await marcaAplicada();
    expect(marca?.css).toContain(":root:root {");
    expect(marca?.css).toContain("--primary: #1D47C4;");
    expect(metadatosDeLaMarca(marca).title).toEqual({
      default: "Escenara · Da vida a cada escena",
      template: "%s · Escenara",
    });
    const vista = await estado();
    expect(vista.borrador).toBeNull();
    expect(vista.publicada?.version).toBe(datos.publicada?.version as number);
  });

  test("un texto sin contraste AA bloquea la publicación con el par y la razón; lo publicado no cambia", async () => {
    expect((await guardar(conColor("#1D47C4"))).estado).toBe(200);
    expect((await publicar()).estado).toBe(200);
    const doc = conColor("#1D47C4");
    doc.theme.light.textMuted = "#B0B4BD";
    expect((await guardar(doc)).estado).toBe(200); // Un borrador sí se puede guardar.
    const r = await publicar();
    expect(r.estado).toBe(422);
    expect(r.datos.error).toMatch(
      /^No se publica: .*Tema claro: textMuted sobre background da \d,\d\d:1 y necesita 4,5:1\./,
    );
    expect(r.datos.bloqueos?.[0]).toMatchObject({ delante: "textMuted", detras: "background" });
    const vista = await estado();
    expect(vista.borrador).not.toBeNull();
    expect(vista.publicada?.documento.theme.light.textMuted).toBe(documentoBase().theme.light.textMuted);
  });

  test("la publicación es atómica: un fallo a mitad no deja ni la marca retirada ni derivados a medias", async () => {
    expect((await guardar(conColor("#1D47C4"))).estado).toBe(200);
    expect((await publicar()).estado).toBe(200);
    const publicadaAntes = (await estado()).publicada;
    const logo = await subirLogo(await png(256, 256));
    expect(logo.estado).toBe(201);
    expect(
      (await guardar(conColor("#2753D7"), { logos: { "simbolo-claro": logo.datos.activo?.id }, fuentes: [] })).estado,
    ).toBe(200);
    const derivadosAntes = (await db().select().from(brandAssets).where(eq(brandAssets.kind, "derivado"))).length;

    // El generador de verdad, cortado después del primer derivado: uno llega a subirse y a apuntarse antes del fallo.
    const fallaAMitad = async (d: DocumentoMarca, a: Parameters<typeof generarDerivados>[1]) => {
      const reales = [...(await generarDerivados(d, a))];
      return (function* () {
        yield reales[0] as (typeof reales)[number];
        throw new Error("fallo a mitad de la publicación");
      })();
    };
    const intento = publicarBorrador({ id: admin.id, esAdmin: true }, fallaAMitad).catch((e: Error) => e);
    const error = await intento;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("No ha cambiado nada");

    const despues = await estado();
    expect(despues.publicada?.id).toBe(publicadaAntes?.id as string);
    expect(despues.publicada?.documento).toEqual(publicadaAntes?.documento as DocumentoMarca);
    expect(despues.borrador?.documento.theme.light.primary).toBe("#2753D7");
    const derivados = await db().select().from(brandAssets).where(eq(brandAssets.kind, "derivado"));
    expect(derivados.length).toBe(derivadosAntes);
    expect((await marcaAplicada())?.css).toContain("--primary: #1D47C4;");
  });

  test("al publicar con logotipo se generan favicon 16/32, iconos 192/512 e imagen social, y el manifiesto los usa", async () => {
    const logo = await subirLogo(await png(240, 120, "#2753D7"));
    expect(logo.estado).toBe(201);
    expect(logo.datos.activo?.mime).toBe("image/png");
    expect(
      (await guardar(documentoBase(), { logos: { "horizontal-claro": logo.datos.activo?.id }, fuentes: [] })).estado,
    ).toBe(200);
    const { datos } = await publicar();
    const [fila] = await db()
      .select()
      .from(brandVersions)
      .where(eq(brandVersions.id, datos.publicada?.id as string));
    expect(Object.keys(fila?.derived ?? {}).sort()).toEqual([
      "favicon-16",
      "favicon-32",
      "icono-192",
      "icono-512",
      "imagen-social",
    ]);
    const [favicon] = await db()
      .select()
      .from(brandAssets)
      .where(eq(brandAssets.id, fila?.derived["favicon-32"] as string));
    const meta = await sharp(new Uint8Array(await leerObjeto(favicon?.storageKey as string).arrayBuffer())).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["png", 32, 32]);
    const [social] = await db()
      .select()
      .from(brandAssets)
      .where(eq(brandAssets.id, fila?.derived["imagen-social"] as string));
    expect([social?.width, social?.height]).toEqual([1200, 630]);

    const marca = await marcaAplicada();
    const metadatos = metadatosDeLaMarca(marca);
    expect(JSON.stringify(metadatos.icons)).toContain(marca?.iconos.favicon32 as string);
    expect(metadatos.manifest).toBe("/api/marca/manifest");
    const manifiesto = await rutaManifiesto.GET();
    expect(manifiesto.status).toBe(200);
    expect(((await manifiesto.json()) as { icons: unknown[] }).icons).toHaveLength(2);
  });

  test("revertir vuelve a publicar una versión anterior tal como era, en un clic", async () => {
    await guardar(conColor("#1D47C4"));
    const v1 = (await publicar()).datos.publicada as VersionMarcaVista;
    await guardar(conColor("#2750CC"));
    const v2 = (await publicar()).datos.publicada as VersionMarcaVista;
    expect(v2.version).toBeGreaterThan(v1.version);
    expect((await marcaAplicada())?.css).toContain("--primary: #2750CC;");

    const r = await rutaRevertir.POST(pedir(admin, `/api/admin/marca/versiones/${v1.id}/revertir`, "POST"), ctx(v1.id));
    expect(r.status).toBe(200);
    const vista = await estado();
    expect(vista.publicada?.id).toBe(v1.id);
    expect(vista.historial.map((v) => v.id)).toEqual([v2.id, v1.id]);
    expect((await marcaAplicada())?.css).toContain("--primary: #1D47C4;");
    // Revertir a la que ya está publicada, o a algo que no existe, dice por qué no.
    expect(
      (await rutaRevertir.POST(pedir(admin, `/api/admin/marca/versiones/${v1.id}/revertir`, "POST"), ctx(v1.id)))
        .status,
    ).toBe(409);
    expect(
      (await rutaRevertir.POST(pedir(admin, "/api/admin/marca/versiones/nada/revertir", "POST"), ctx("nada"))).status,
    ).toBe(404);
  });

  test("volver a la marca de Escenara retira la publicada y deja de aplicarse", async () => {
    await guardar(conColor("#1D47C4"));
    await publicar();
    expect(await marcaAplicada()).not.toBeNull();
    expect((await rutaRetirar.POST(pedir(admin, "/api/admin/marca/retirar", "POST"), undefined)).status).toBe(204);
    expect(await marcaAplicada()).toBeNull();
    expect((await estado()).historial).toHaveLength(1);
  });

  // ── Archivos: válidos, inválidos y maliciosos ────────────────────────────────────────────────────────────

  test("los logotipos válidos entran recodificados y se sirven con su tipo real, nosniff y CSP cerrada", async () => {
    const r = await subirLogo(await png(300, 120));
    expect(r.estado).toBe(201);
    expect([r.datos.activo?.mime, r.datos.activo?.ancho, r.datos.activo?.alto]).toEqual(["image/png", 300, 120]);
    const servido = await rutaActivo.GET(pedir(null, r.datos.activo?.url as string), ctx(r.datos.activo?.id as string));
    expect(servido.status).toBe(200);
    expect(servido.headers.get("content-type")).toBe("image/png");
    expect(servido.headers.get("x-content-type-options")).toBe("nosniff");
    expect(servido.headers.get("content-security-policy")).toContain("sandbox");
    expect(servido.headers.get("content-security-policy")).toBe(
      "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    );
  });

  test.each([
    ["SVG de <use> anidados (10⁵ instancias)", () => svg(usosAnidados(5)), 415, /no admite logotipos en SVG/],
    ["SVG con script", () => svg("<script>alert(document.cookie)</script>"), 415, /no admite logotipos en SVG/],
    [
      "SVG con entidades XML",
      () => new File(['<!DOCTYPE svg [<!ENTITY a "x">]><svg xmlns="http://www.w3.org/2000/svg">&a;</svg>'], "x.svg"),
      415,
      /no admite logotipos en SVG/,
    ],
    [
      "HTML disfrazado de PNG",
      () => new File(["<html><script>alert(1)</script></html>"], "logo.png", { type: "image/png" }),
      415,
      /Convierte tu logotipo a PNG \(con fondo transparente\) o a WebP/,
    ],
    [
      "ejecutable disfrazado de PNG",
      () => new File([new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 1, 2, 3, 4])], "logo.png", { type: "image/png" }),
      415,
      /PNG, JPEG o WebP/,
    ],
    [
      "GIF",
      () => new File([new TextEncoder().encode("GIF89a\u0001\u0000\u0001\u0000")], "logo.gif", { type: "image/gif" }),
      415,
      /PNG, JPEG o WebP/,
    ],
  ])("se rechaza con su causa y al momento: %s", async (_, archivo, esperado, causa) => {
    const inicio = performance.now();
    const r = await subirLogo(archivo());
    expect(performance.now() - inicio).toBeLessThan(2000);
    expect(r.estado).toBe(esperado);
    expect(r.datos.error).toMatch(causa);
  });

  test("un logotipo diminuto o demasiado grande se rechaza por sus medidas o su peso", async () => {
    expect((await subirLogo(await png(8, 8))).datos.error).toMatch(/mínimo es 16 px/);
    expect((await subirLogo(await png(5000, 20))).datos.error).toMatch(/máximo es 4096 px/);
    const grande = new File([new Uint8Array(3 * 1024 * 1024).fill(1)], "enorme.png", { type: "image/png" });
    expect((await subirLogo(grande)).estado).toBe(413);
  });

  test("una fuente WOFF2 con licencia declarada entra con su fecha; sin declaración o en TTF, no", async () => {
    const campos = {
      familia: "Mi Fuente",
      licencia: "ofl",
      titular: "The Manrope Project Authors",
      nota: "",
      acepto: "si",
    };
    const sinAceptar = await rutaSubir.POST(
      subida(admin, "/api/admin/marca/activos?tipo=fuente", await manrope(), { ...campos, acepto: "" }),
      undefined,
    );
    expect(sinAceptar.status).toBe(422);
    const nombreMalo = await rutaSubir.POST(
      subida(admin, "/api/admin/marca/activos?tipo=fuente", await manrope(), { ...campos, familia: 'X"; } body {' }),
      undefined,
    );
    expect(nombreMalo.status).toBe(422);
    const ttf = new Uint8Array(64);
    ttf.set([0x00, 0x01, 0x00, 0x00]);
    const rTtf = await rutaSubir.POST(
      subida(admin, "/api/admin/marca/activos?tipo=fuente", new File([ttf], "f.ttf"), campos),
      undefined,
    );
    expect(rTtf.status).toBe(422);
    expect(((await rTtf.json()) as { error: string }).error).toMatch(/conviértela a WOFF2/);

    const bien = await rutaSubir.POST(
      subida(admin, "/api/admin/marca/activos?tipo=fuente", await manrope(), campos),
      undefined,
    );
    expect(bien.status).toBe(201);
    const activo = ((await bien.json()) as { activo: ActivoVista }).activo;
    expect(activo.familia).toBe("Mi Fuente");
    expect(activo.licencia?.tipo).toBe("ofl");
    expect(Date.now() - new Date(activo.licencia?.declaradaEn as string).getTime()).toBeLessThan(60_000);

    const doc = structuredClone(documentoBase());
    doc.typography.family = "Mi Fuente, ui-sans-serif, system-ui, sans-serif";
    expect((await guardar(doc, { logos: {}, fuentes: [{ activoId: activo.id, familia: "Otra; }" }] })).estado).toBe(
      200,
    );
    expect((await publicar()).estado).toBe(200);
    const css = (await marcaAplicada())?.css ?? "";
    // La familia es la declarada al subirla, no la que diga la petición.
    expect(css).toContain(
      `@font-face { font-family: "Mi Fuente"; src: url("/api/marca/activos/${activo.id}") format("woff2");`,
    );
    expect(css).toContain("--font-manrope: Mi Fuente, ui-sans-serif, system-ui, sans-serif;");
    const servida = await rutaActivo.GET(pedir(null, activo.url), ctx(activo.id));
    expect(servida.headers.get("content-type")).toBe("font/woff2");
  });

  test("un borrador no puede usar el logotipo del kit de otro usuario ni un archivo que no existe", async () => {
    const kit = await rutaLogoKit.POST(subida(ana, "/api/cuenta/kit/logotipo", await png(200, 100)), undefined);
    const idDelKit = ((await kit.json()) as { kit: KitVista }).kit.logo?.id as string;
    expect((await guardar(documentoBase(), { logos: { "horizontal-claro": idDelKit }, fuentes: [] })).estado).toBe(422);
    expect(
      (await guardar(documentoBase(), { logos: { "horizontal-claro": crypto.randomUUID() }, fuentes: [] })).estado,
    ).toBe(422);
    expect((await guardar(documentoBase(), { logos: { inventado: crypto.randomUUID() }, fuentes: [] })).estado).toBe(
      422,
    );
  });

  // ── Kit del creador ─────────────────────────────────────────────────────────────────────────────────────

  test("cada usuario solo ve y cambia su kit; su logotipo no lo puede leer nadie más", async () => {
    const subido = await rutaLogoKit.POST(
      subida(ana, "/api/cuenta/kit/logotipo", await png(200, 100, "#ffffff")),
      undefined,
    );
    expect(subido.status).toBe(201);
    const kitAna = ((await subido.json()) as { kit: KitVista }).kit;
    expect(kitAna.logo?.mime).toBe("image/png");
    const guardado = await rutaKit.PUT(
      pedir(ana, "/api/cuenta/kit", "PUT", { nombre: "Estudio Ana", esquina: "abajo-izquierda", activo: true }),
      undefined,
    );
    expect(guardado.status).toBe(200);

    const deBeto = (await (await rutaKit.GET(pedir(beto, "/api/cuenta/kit"), undefined)).json()) as { kit: KitVista };
    expect(deBeto.kit).toEqual({ nombre: "", logo: null, esquina: "arriba-derecha", activo: true });
    const logoId = kitAna.logo?.id as string;
    expect((await rutaActivo.GET(pedir(beto, `/api/marca/activos/${logoId}`), ctx(logoId))).status).toBe(404);
    expect((await rutaActivo.GET(pedir(null, `/api/marca/activos/${logoId}`), ctx(logoId))).status).toBe(404);
    expect((await rutaActivo.GET(pedir(ana, `/api/marca/activos/${logoId}`), ctx(logoId))).status).toBe(200);

    // El kit de Ana no cambia nada de la instalación.
    expect(await marcaAplicada()).toBeNull();
    const malo = await rutaKit.PUT(
      pedir(ana, "/api/cuenta/kit", "PUT", { nombre: "<b>x</b>", esquina: "centro", activo: true }),
      undefined,
    );
    expect(malo.status).toBe(422);
    const svgMalo = await rutaLogoKit.POST(
      subida(ana, "/api/cuenta/kit/logotipo", svg("<script>x()</script>")),
      undefined,
    );
    expect(svgMalo.status).toBe(415);
  });

  // ── Límites y limpieza ─────────────────────────────────────────────────────────────────────────────────────

  test("con URL pública, la imagen social es absoluta a esa URL; sin ella (o con localhost), no se emite", async () => {
    const previa = (await leerAjustes()).urlPublica;
    try {
      const logo = await subirLogo(await png(240, 120));
      await guardar(documentoBase(), { logos: { "simbolo-claro": logo.datos.activo?.id }, fuentes: [] });
      expect((await publicar()).estado).toBe(200);
      const marca = await marcaAplicada();
      expect(marca?.iconos.social).toBeDefined();

      await guardarAjustes({ urlPublica: "https://estudio.ejemplo.es" }, null);
      const base = baseDeLaInstalacion((await leerAjustes()).urlPublica, "http://localhost:3021");
      const con = metadatosDeLaMarca(marca, base);
      expect(String(con.metadataBase)).toBe("https://estudio.ejemplo.es/");
      expect(JSON.stringify(con.openGraph)).toContain(marca?.iconos.social as string);
      expect(JSON.stringify(con)).not.toContain("localhost");

      await guardarAjustes({ urlPublica: "" }, null);
      const sin = metadatosDeLaMarca(
        marca,
        baseDeLaInstalacion((await leerAjustes()).urlPublica, "http://localhost:3021"),
      );
      expect(sin.metadataBase).toBeUndefined();
      expect(JSON.stringify(sin.openGraph)).not.toContain("images");
      // Sin marca publicada, los metadatos de siempre, sin base.
      expect(metadatosDeLaMarca(null, base)).toEqual(METADATOS_DE_ESCENARA);
    } finally {
      await guardarAjustes({ urlPublica: previa }, null);
    }
  });

  test("con el procesado de imágenes lleno, una subida más recibe un 503 con la causa y no se guarda nada", async () => {
    const antes = (await db().select().from(brandAssets).where(eq(brandAssets.ownerId, ana.id))).length;
    const soltar: (() => void)[] = [];
    const ocupados = Array.from({ length: PROCESADOS_SIMULTANEOS }, () =>
      conCupoDeImagen(() => new Promise<void>((r) => soltar.push(r))),
    );
    try {
      const r = await rutaLogoKit.POST(subida(ana, "/api/cuenta/kit/logotipo", await png(64, 64)), undefined);
      expect(r.status).toBe(503);
      expect(((await r.json()) as { error: string }).error).toContain("se están procesando otras imágenes");
      expect((await db().select().from(brandAssets).where(eq(brandAssets.ownerId, ana.id))).length).toBe(antes);
    } finally {
      for (const s of soltar) s();
      await Promise.all(ocupados);
    }
  });

  test("una subida por trozos sin Content-Length más grande que el máximo se corta con 413", async () => {
    let enviados = 0;
    const cuerpo = new ReadableStream<Uint8Array>({
      pull(c) {
        if (enviados >= 200) return c.close();
        enviados++;
        c.enqueue(new Uint8Array(64 * 1024));
      },
    });
    const peticion = new Request("http://localhost/api/cuenta/kit/logotipo", {
      method: "POST",
      headers: { cookie: ana.cookie, origin: "http://localhost", "content-type": "multipart/form-data; boundary=x" },
      body: cuerpo,
      duplex: "half",
    } as RequestInit);
    const r = await rutaLogoKit.POST(peticion, undefined);
    expect(r.status).toBe(413);
    expect(enviados).toBeLessThan(200);
  });

  test("al cambiar el logotipo del kit se borra el anterior, y el barrido quita los que quedaron sueltos", async () => {
    const primero = (
      (await (
        await rutaLogoKit.POST(subida(ana, "/api/cuenta/kit/logotipo", await png(64, 64)), undefined)
      ).json()) as { kit: KitVista }
    ).kit;
    const segundo = (
      (await (
        await rutaLogoKit.POST(subida(ana, "/api/cuenta/kit/logotipo", await png(80, 40)), undefined)
      ).json()) as { kit: KitVista }
    ).kit;
    const deAna = async () =>
      (await db().select().from(brandAssets).where(eq(brandAssets.ownerId, ana.id))).map((a) => a.id);
    expect(await deAna()).toEqual([segundo.logo?.id as string]);
    expect(primero.logo?.id).not.toBe(segundo.logo?.id);

    // Uno suelto (por ejemplo, de dos subidas a la vez) y antiguo: el barrido lo quita y deja el actual.
    const suelto = crypto.randomUUID();
    await db()
      .insert(brandAssets)
      .values({
        id: suelto,
        scope: "kit",
        kind: "logotipo",
        ownerId: ana.id,
        storageKey: `marca/kit/${suelto}.png`,
        mimeType: "image/png",
        sizeBytes: 1,
        sha256: "x",
        createdAt: new Date(Date.now() - 60 * 60_000),
      });
    await barrerLogosHuerfanosDelKit(ana.id);
    expect(await deAna()).toEqual([segundo.logo?.id as string]);
  });
});
