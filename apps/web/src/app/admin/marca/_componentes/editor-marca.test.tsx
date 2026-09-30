import { describe, expect, mock, test } from "bun:test";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { type DocumentoMarca, validarDocumentoMarca } from "@/lib/marca-esquema";
import type { EstadoMarcaVista, VersionMarcaVista } from "@/lib/marca-vista";

// El editor refresca la página tras publicar; aquí no hay enrutador de Next, así que se sustituye `useRouter` por uno
// vacío. El resto del módulo se conserva tal cual: `bun test` comparte el proceso y otros ficheros usan `notFound`.
const navegacion = await import("next/navigation");
mock.module("next/navigation", () => ({ ...navegacion, useRouter: () => ({ refresh() {} }) }));
const { EditorMarca } = await import("./editor-marca");

const raiz = path.resolve(import.meta.dir, "../../../../../../..");
const r = validarDocumentoMarca(await Bun.file(path.join(raiz, "docs/branding/escenara.brand.json")).json());
if (!r.ok) throw new Error("la marca de referencia debería ser válida");
const base = r.documento;

const version = (n: number, estado: VersionMarcaVista["estado"], documento: DocumentoMarca): VersionMarcaVista => ({
  id: crypto.randomUUID(),
  version: n,
  estado,
  documento,
  activos: { logos: {}, fuentes: [] },
  notas: estado === "publicada" ? "Colores de otoño" : "",
  creadaEn: "2026-09-30T08:00:00.000Z",
  publicadaEn: estado === "borrador" ? null : "2026-09-30T09:00:00.000Z",
});

const pintar = (estado: Partial<EstadoMarcaVista> = {}) =>
  renderToStaticMarkup(
    <EditorMarca estadoInicial={{ borrador: null, publicada: null, historial: [], base, activos: {}, ...estado }} />,
  );

describe("/admin/marca", () => {
  test("pinta el editor por secciones y la previsualización de los dos temas a la vez con componentes reales", () => {
    const html = pintar();
    for (const seccion of [
      "Previsualización",
      "Textos",
      "Colores",
      "Tipografía",
      "Logotipos",
      "Guardar y publicar",
      "Historial",
    ]) {
      expect(html).toContain(`>${seccion}</h2>`);
    }
    expect(html).toContain('data-previa-tema="light"');
    expect(html).toContain('data-previa-tema="dark"');
    // Cada panel lleva los tokens de su tema en su propio estilo.
    expect(html).toContain(`--background:${base.theme.light.background}`);
    expect(html).toContain(`--background:${base.theme.dark.background}`);
    expect(html).toContain("Crear escena");
    expect(html).toContain("Sin marca publicada: la instalación usa la marca de Escenara.");
    expect(html).toContain("Guardar borrador");
    expect(html).toContain("Publicar");
    expect(html).toContain("Todavía no se ha publicado ninguna versión");
  });

  test("un borrador con un texto sin contraste enseña el bloqueo y desactiva Publicar", () => {
    const doc = structuredClone(base);
    doc.theme.dark.text = "#303540";
    const html = pintar({ borrador: version(2, "borrador", doc) });
    expect(html).toContain("Hay textos que no se leen: así no se puede publicar");
    expect(html).toContain("Tema oscuro: text sobre background da");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*Publicar<\/button>/);
    expect(html).toContain("Editando el borrador de la versión 2.");
  });

  test("un borrador con un color inválido lo marca en su campo y no deja guardar", () => {
    const doc = structuredClone(base) as DocumentoMarca;
    doc.theme.light.primary = "azul";
    const html = pintar({ borrador: version(3, "borrador", doc) });
    expect(html).toContain("Hay campos que no son válidos");
    expect(html).toContain("Tiene que ser un color hexadecimal de seis cifras");
    expect(html).toContain('aria-invalid="true"');
  });

  test("el historial enseña la publicada y ofrece revertir a las anteriores y volver a la de Escenara", () => {
    const publicada = version(2, "publicada", base);
    const anterior = version(1, "retirada", base);
    const html = pintar({ publicada, historial: [publicada, anterior] });
    expect(html).toContain("Publicada: versión 2");
    expect(html).toContain("Revertir a la versión 1");
    expect(html).not.toContain("Revertir a la versión 2");
    expect(html).toContain("Volver a la marca de Escenara");
    expect(html).toContain("Colores de otoño");
  });
});
