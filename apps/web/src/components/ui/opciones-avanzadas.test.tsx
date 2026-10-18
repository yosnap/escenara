import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { OpcionesAvanzadas, PREFIJO_SESION_AVANZADAS } from "./opciones-avanzadas";

describe("opciones avanzadas en el servidor", () => {
  test("empiezan plegadas: el contenido no se pinta y el botón dice que está cerrado", () => {
    const html = renderToStaticMarkup(
      <OpcionesAvanzadas clave="crear" resumen="Modelo del clip">
        <p>Modelo secreto</p>
      </OpcionesAvanzadas>,
    );
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("Opciones avanzadas");
    expect(html).toContain("Modelo del clip");
    expect(html).not.toContain("Modelo secreto");
    expect(html).not.toMatch(/\bborder-[lrse](-|\b)/);
  });

  test("con un requisito pendiente dentro se pintan abiertas y lo explican", () => {
    const html = renderToStaticMarkup(
      <OpcionesAvanzadas clave="crear" forzarAbierto>
        <p>Selector</p>
      </OpcionesAvanzadas>,
    );
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("Selector");
    expect(html).toContain("Se queda abierto");
  });
});

describe("opciones avanzadas en el navegador", () => {
  let ventana: Window;
  let raiz: Root;
  const anteriores = new Map<string, PropertyDescriptor | undefined>();
  beforeEach(() => {
    ventana = new Window({ url: "https://escenara.test" });
    for (const [clave, valor] of Object.entries({
      window: ventana,
      document: ventana.document,
      sessionStorage: ventana.sessionStorage,
      IS_REACT_ACT_ENVIRONMENT: true,
    })) {
      anteriores.set(clave, Object.getOwnPropertyDescriptor(globalThis, clave));
      Object.defineProperty(globalThis, clave, { value: valor, writable: true, configurable: true });
    }
    const contenedor = ventana.document.createElement("div");
    ventana.document.body.append(contenedor);
    raiz = createRoot(contenedor as unknown as HTMLElement);
  });
  afterEach(async () => {
    await act(async () => raiz.unmount());
    for (const [clave, descriptor] of anteriores) {
      if (descriptor) Object.defineProperty(globalThis, clave, descriptor);
      else Reflect.deleteProperty(globalThis, clave);
    }
    anteriores.clear();
    await ventana.happyDOM.close();
  });

  const pintar = (clave: string) =>
    act(async () =>
      raiz.render(
        <OpcionesAvanzadas clave={clave}>
          <p>Contenido avanzado</p>
        </OpcionesAvanzadas>,
      ),
    );
  const boton = () => ventana.document.querySelector("button");

  test("al abrir muestra el contenido, enlaza el botón con él y lo recuerda en la sesión", async () => {
    await pintar("proyecto:1");
    expect(ventana.document.body.textContent).not.toContain("Contenido avanzado");
    await act(async () => boton()?.click());
    expect(boton()?.getAttribute("aria-expanded")).toBe("true");
    const id = boton()?.getAttribute("aria-controls") ?? "";
    expect(ventana.document.getElementById(id)?.textContent).toContain("Contenido avanzado");
    expect(ventana.sessionStorage.getItem(`${PREFIJO_SESION_AVANZADAS}proyecto:1`)).toBe("1");
    await act(async () => boton()?.click());
    expect(ventana.document.body.textContent).not.toContain("Contenido avanzado");
    expect(ventana.sessionStorage.getItem(`${PREFIJO_SESION_AVANZADAS}proyecto:1`)).toBe("0");
  });

  test("cada vídeo recuerda lo suyo: otro vídeo sigue plegado", async () => {
    ventana.sessionStorage.setItem(`${PREFIJO_SESION_AVANZADAS}proyecto:1`, "1");
    await pintar("proyecto:1");
    expect(boton()?.getAttribute("aria-expanded")).toBe("true");
    await pintar("proyecto:2");
    expect(boton()?.getAttribute("aria-expanded")).toBe("false");
  });

  test("con el almacenamiento bloqueado sigue abriéndose y cerrándose", async () => {
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      get() {
        throw new Error("Almacenamiento bloqueado");
      },
    });
    await pintar("crear");
    await act(async () => boton()?.click());
    expect(ventana.document.body.textContent).toContain("Contenido avanzado");
  });
});
