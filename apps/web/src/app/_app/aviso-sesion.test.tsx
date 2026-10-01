import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AvisoSesion } from "./aviso-sesion";

let ventana: Window;
let raiz: Root;
let reloj: ReturnType<typeof spyOn>;
let peticion: ReturnType<typeof spyOn>;
let ahora = 100_000;
const anteriores = new Map<string, PropertyDescriptor | undefined>();
beforeEach(() => {
  ventana = new Window({ url: "https://escenara.test/crear" });
  for (const [clave, valor] of Object.entries({
    window: ventana,
    document: ventana.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    anteriores.set(clave, Object.getOwnPropertyDescriptor(globalThis, clave));
    Object.defineProperty(globalThis, clave, { value: valor, writable: true, configurable: true });
  }
  ahora = 100_000;
  reloj = spyOn(Date, "now").mockImplementation(() => ahora);
  peticion = spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ session: { id: "s" }, user: { id: "u" } }));
  raiz = createRoot(ventana.document.body.appendChild(ventana.document.createElement("div")) as unknown as HTMLElement);
});
afterEach(async () => {
  await act(async () => raiz.unmount());
  reloj.mockRestore();
  peticion.mockRestore();
  for (const [clave, descriptor] of anteriores) {
    if (descriptor) Object.defineProperty(globalThis, clave, descriptor);
    else Reflect.deleteProperty(globalThis, clave);
  }
  anteriores.clear();
  await ventana.happyDOM.close();
});
const pintar = () =>
  act(async () => {
    raiz.render(
      <>
        <input aria-label="Borrador" defaultValue="Escena que todavía no he guardado" />
        <AvisoSesion />
      </>,
    );
  });
const foco = () =>
  act(async () => {
    ahora += 31_000;
    ventana.dispatchEvent(new ventana.Event("focus"));
  });
test("al terminar la sesión avisa sin sustituir el borrador y permite entrar en otra pestaña", async () => {
  await pintar();
  expect(ventana.document.querySelector('[role="alert"]')).toBeNull();
  peticion.mockImplementation(async () => Response.json(null));
  await foco();
  expect(ventana.document.querySelector('[role="alert"]')?.textContent).toContain(
    "Tu sesión ha caducado o se ha cerrado",
  );
  expect(ventana.document.querySelector("input")?.value).toBe("Escena que todavía no he guardado");
  expect(ventana.document.querySelector("a")?.target).toBe("_blank");
  peticion.mockImplementation(async () => Response.json({ session: { id: "s" }, user: { id: "u" } }));
  await foco();
  expect(ventana.document.querySelector('[role="alert"]')).toBeNull();
});
test("un fallo de red al volver a la pantalla no muestra un cierre falso", async () => {
  await pintar();
  peticion.mockRejectedValue(new TypeError("offline"));
  await foco();
  expect(ventana.document.querySelector('[role="alert"]')).toBeNull();
  expect(ventana.document.querySelector("input")?.value).toBe("Escena que todavía no he guardado");
});
