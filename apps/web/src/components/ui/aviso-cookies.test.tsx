import { afterEach, beforeEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AvisoCookies } from "./aviso-cookies";

let ventana: Window;
let raiz: Root;
const anteriores = new Map<string, PropertyDescriptor | undefined>();
beforeEach(() => {
  ventana = new Window({ url: "https://escenara.test" });
  for (const [clave, valor] of Object.entries({
    window: ventana,
    document: ventana.document,
    localStorage: ventana.localStorage,
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
const pintar = () => act(async () => raiz.render(<AvisoCookies />));
test("con almacenamiento bloqueado sigue informando y el aviso puede cerrarse", async () => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new Error("Almacenamiento bloqueado");
    },
  });
  await pintar();
  expect(ventana.document.querySelector("aside")).not.toBeNull();
  const cerrar = [...ventana.document.querySelectorAll("button")].find((b) => b.textContent === "Entendido");
  await act(async () => cerrar?.click());
  expect(ventana.document.querySelector("aside")).toBeNull();
});
test("informa, recuerda el cierre y permite volver a abrir sin activar seguimiento", async () => {
  await pintar();
  expect(ventana.document.querySelector("aside")?.textContent).toContain(
    "No usamos cookies de analítica ni publicidad",
  );
  const cerrar = [...ventana.document.querySelectorAll("button")].find((b) => b.textContent === "Entendido");
  await act(async () => cerrar?.click());
  expect(ventana.document.querySelector("aside")).toBeNull();
  expect(Number(ventana.localStorage.getItem("escenara-aviso-cookies-v1"))).toBeGreaterThan(Date.now());
  await act(async () => ventana.document.querySelector("button")?.click());
  expect(ventana.document.querySelector("aside")).not.toBeNull();
  expect(ventana.document.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
});
test("el aviso leído no reaparece durante su vigencia y sí al caducar", async () => {
  ventana.localStorage.setItem("escenara-aviso-cookies-v1", String(Date.now() + 60_000));
  await pintar();
  expect(ventana.document.querySelector("aside")).toBeNull();
  await act(async () => raiz.unmount());
  ventana.localStorage.setItem("escenara-aviso-cookies-v1", String(Date.now() - 1));
  raiz = createRoot(ventana.document.body.appendChild(ventana.document.createElement("div")) as unknown as HTMLElement);
  await pintar();
  expect(ventana.document.querySelector("aside")).not.toBeNull();
});
