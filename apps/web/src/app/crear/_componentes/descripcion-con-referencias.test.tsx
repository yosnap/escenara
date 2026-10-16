import { afterEach, beforeEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import type { Medio } from "@/lib/media/tipos";
import { DescripcionConReferencias, mencionEnCursor } from "./descripcion-con-referencias";

const referencias = [{ id: "r1", etiqueta: "terraza", uso: "lugar" as const, medio: { id: "m1" } as Medio }];
let ventana: Window;
let raiz: Root;
const anteriores = new Map<string, PropertyDescriptor | undefined>();
beforeEach(() => {
  ventana = new Window();
  for (const [clave, valor] of Object.entries({
    window: ventana,
    document: ventana.document,
    IS_REACT_ACT_ENVIRONMENT: true,
    requestAnimationFrame: (f: () => void) => {
      f();
      return 0;
    },
  })) {
    anteriores.set(clave, Object.getOwnPropertyDescriptor(globalThis, clave));
    Object.defineProperty(globalThis, clave, { value: valor, writable: true, configurable: true });
  }
  raiz = createRoot(ventana.document.body.appendChild(ventana.document.createElement("div")) as unknown as HTMLElement);
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

test("detecta menciones en el cursor, también con puntuación, sin confundir correos", () => {
  expect(mencionEnCursor("En @te, después", 6)).toEqual({ inicio: 3, busqueda: "te" });
  expect(mencionEnCursor("(@", 2)).toEqual({ inicio: 1, busqueda: "" });
  expect(mencionEnCursor("jorge@terraza", 13)).toBeNull();
});
test("resalta solo las etiquetas que tienen imagen, en negrita y color de acento", () => {
  const html = renderToStaticMarkup(
    <DescripcionConReferencias valor="En @terraza con @abrigo" onCambio={() => {}} referencias={referencias} />,
  );
  expect(html).toContain('font-bold text-acento">@terraza</strong>');
  expect(html).not.toContain('text-acento">@abrigo</strong>');
});
function Escena() {
  const [valor, cambiar] = useState("En @te, Jorge camina");
  return <DescripcionConReferencias valor={valor} onCambio={cambiar} referencias={referencias} />;
}
test("elegir una sugerencia inserta la etiqueta sin perder el resto del texto", async () => {
  await act(async () => raiz.render(<Escena />));
  const campo = ventana.document.querySelector("textarea");
  if (!campo) throw new Error("Falta el campo de descripción");
  await act(async () => {
    campo.setSelectionRange(6, 6);
    campo.focus();
  });
  expect(ventana.document.querySelector('[role="option"]')?.textContent).toContain("@terraza");
  await act(async () => {
    ventana.document.querySelector("button")?.click();
  });
  expect(campo.value).toBe("En @terraza, Jorge camina");
  expect(ventana.document.querySelector('[role="listbox"]') === null).toBe(true);
});
test("Enter elige la referencia y Escape cierra las sugerencias", async () => {
  await act(async () => raiz.render(<Escena />));
  const campo = ventana.document.querySelector("textarea");
  if (!campo) throw new Error("Falta el campo de descripción");
  await act(async () => {
    campo.setSelectionRange(6, 6);
    campo.focus();
  });
  await act(async () => {
    campo.dispatchEvent(new ventana.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  expect(ventana.document.querySelector('[role="listbox"]') === null).toBe(true);
  await act(async () => {
    campo.blur();
    campo.focus();
  });
  await act(async () => {
    campo.dispatchEvent(new ventana.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  expect(campo.value).toBe("En @terraza, Jorge camina");
});
