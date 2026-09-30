import { describe, expect, test } from "bun:test";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { causaDelFallo, mensajeAlCerrarSesion, mensajeDePantalla, mensajeDeParte } from "@/lib/fallo-de-carga";
import { LimiteDeCarga, PantallaDeError } from "./limite-de-carga";

/**
 * Lo que se carga en diferido no puede tumbar la página si su trozo no llega, y una pantalla que falla dice la causa y
 * cómo seguir sin enseñar nada técnico.
 */

const trozoPerdido = Object.assign(new Error("Loading chunk 812 failed. (missing: /_next/static/chunks/812.js)"), {
  name: "ChunkLoadError",
});

describe("causa del fallo", () => {
  test("un trozo que ya no existe, sin red o cualquier otro", () => {
    expect(causaDelFallo(trozoPerdido)).toBe("trozo");
    expect(causaDelFallo(new TypeError("Failed to fetch dynamically imported module: /x.js"))).toBe("trozo");
    expect(causaDelFallo(new TypeError("Importing a module script failed."))).toBe("trozo");
    expect(causaDelFallo(new TypeError("Failed to fetch"))).toBe("red");
    expect(causaDelFallo(trozoPerdido, false)).toBe("red");
    expect(causaDelFallo(new Error("x is undefined"))).toBe("otro");
    expect(causaDelFallo(undefined)).toBe("otro");
  });

  test("una parte que no ha llegado siempre pide recargar; una pantalla, según la causa", () => {
    for (const causa of ["trozo", "red", "otro"] as const) expect(mensajeDeParte(causa).accion).toBe("recargar");
    expect(mensajeDeParte("trozo").titulo).toBe("No se ha podido cargar esta parte. Recarga la página.");
    expect(mensajeDePantalla("trozo").accion).toBe("recargar");
    expect(mensajeDePantalla("red").accion).toBe("reintentar");
    expect(mensajeDePantalla("otro").accion).toBe("reintentar");
  });

  test("«Cerrar sesión» distingue sin conexión de recargar, y nunca dice que se cerró", () => {
    expect(mensajeAlCerrarSesion("red")).toStartWith("Sin conexión");
    expect(mensajeAlCerrarSesion("trozo")).toContain("recarga la página");
    expect(mensajeAlCerrarSesion("trozo")).not.toContain("Sin conexión");
    expect(mensajeAlCerrarSesion("rechazo")).toContain("sigue abierta");
    expect(mensajeAlCerrarSesion("otro")).toContain("sigue abierta");
  });
});

describe("límite de error de lo diferido", () => {
  test("sin error pinta su contenido", () => {
    expect(renderToStaticMarkup(<LimiteDeCarga>contenido</LimiteDeCarga>)).toBe("contenido");
  });

  test("con el trozo perdido pinta la alerta de error con «Recargar» en lugar de caer", () => {
    const estado = LimiteDeCarga.getDerivedStateFromError(trozoPerdido);
    const limite = new LimiteDeCarga({ children: "contenido" });
    limite.state = estado;
    const html = renderToStaticMarkup(<>{limite.render()}</>);
    expect(html).toContain('data-alerta="error"');
    expect(html).toContain("No se ha podido cargar esta parte. Recarga la página.");
    expect(html).toContain("Escenara se ha actualizado mientras tenías la página abierta.");
    expect(html).toMatch(/<button[^>]*>(?:<svg.*?<\/svg>)?Recargar<\/button>/);
    expect(html).not.toContain("contenido");
    // Nada técnico: ni el mensaje del error ni la ruta del trozo.
    expect(html).not.toContain("812");
  });

  test("hasta un «throw» sin error deja el aviso, no la página en blanco", () => {
    expect(LimiteDeCarga.getDerivedStateFromError(undefined).error).toBeTruthy();
  });
});

describe("pantalla de error de un segmento", () => {
  test("causa en castellano, Reintentar y Recargar, la referencia y nunca el mensaje técnico", () => {
    const error = Object.assign(new Error('relation "users" does not exist'), { digest: "3456132194" });
    const html = renderToStaticMarkup(<PantallaDeError error={error} retry={() => {}} />);
    expect(html).toContain("No se ha podido mostrar esta pantalla.");
    expect(html).toContain("Reintentar");
    expect(html).toContain("Recargar");
    expect(html).toContain("Referencia: 3456132194");
    expect(html).not.toContain("relation");
  });

  test("tras un despliegue, lo primero que ofrece es recargar", () => {
    const html = renderToStaticMarkup(<PantallaDeError error={trozoPerdido} retry={() => {}} />);
    expect(html.indexOf("Recargar")).toBeLessThan(html.indexOf("Reintentar"));
  });

  test.each([
    "app/error.tsx",
    "app/crear/error.tsx",
    "app/proyectos/error.tsx",
    "app/proyectos/[id]/montaje/error.tsx",
    "app/biblioteca/error.tsx",
  ])("%s existe, usa la pantalla común y deja el foco en #contenido", async (fichero) => {
    const codigo = await Bun.file(path.resolve(import.meta.dir, "../..", fichero)).text();
    expect(codigo).toStartWith('"use client";');
    expect(codigo).toContain("<PantallaDeError {...props} />");
    expect(codigo).toContain('<main id="contenido" tabIndex={-1}');
  });
});
