import { afterEach, beforeEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useTurnoVigente } from "./cambio-de-sujeto";
import { useContextoPersonaje } from "./use-contexto-personaje";

/**
 * El «cargando» del contexto del personaje lo apaga solo la petición vigente: una respuesta atrasada que se descarta
 * no lo apaga mientras la última sigue en camino. Se prueba con un `fetch` falso con retrasos; no sale nada a la red.
 */

let ventana: Window;
let raiz: Root;
const retrasos = new Map<string, number>();
const anteriores = new Map<string, PropertyDescriptor | undefined>();
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  ventana = new Window();
  retrasos.clear();
  const fetchFalso = async (url: string) => {
    const id = new URL(String(url), "http://localhost").pathname.split("/")[3] ?? "";
    await espera(retrasos.get(id) ?? 0);
    const cuerpo = {
      personajeId: id,
      nombre: id,
      versionId: "v",
      versionNumero: 1,
      conContexto: true,
      referencias: [],
      maximoDelModelo: 10,
      modelo: "m",
    };
    return new Response(JSON.stringify(cuerpo), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  for (const [clave, valor] of Object.entries({
    window: ventana,
    document: ventana.document,
    IS_REACT_ACT_ENVIRONMENT: true,
    fetch: fetchFalso,
  })) {
    anteriores.set(clave, Object.getOwnPropertyDescriptor(globalThis, clave));
    Object.defineProperty(globalThis, clave, { value: valor, writable: true, configurable: true });
  }
  raiz = createRoot(ventana.document.body.appendChild(ventana.document.createElement("div")) as unknown as HTMLElement);
});
afterEach(async () => {
  await act(async () => raiz.unmount());
  for (const [clave, d] of anteriores) {
    if (d) Object.defineProperty(globalThis, clave, d);
    else Reflect.deleteProperty(globalThis, clave);
  }
  anteriores.clear();
  await ventana.happyDOM.close();
});

function Prueba() {
  const turno = useTurnoVigente();
  const { contexto, pidiendo, refrescar } = useContextoPersonaje(null, () => {});
  return (
    <div data-pidiendo={String(pidiendo)} data-personaje={contexto?.personajeId ?? ""}>
      {["lento", "rapido", "ultimo"].map((id) => (
        <button key={id} type="button" data-id={id} onClick={() => void refrescar(id, "m", turno())} />
      ))}
      <button type="button" data-id="ninguno" onClick={() => void refrescar(null, "m", turno())} />
    </div>
  );
}

const estado = () => ventana.document.querySelector("[data-pidiendo]");
const pulsar = async (id: string, ms: number) => {
  await act(async () => {
    (ventana.document.querySelector(`[data-id='${id}']`) as unknown as HTMLButtonElement).click();
    await espera(ms);
  });
};

test("una respuesta descartada no apaga el «cargando» ni cambia el contexto de la vigente", async () => {
  await act(async () => raiz.render(<Prueba />));
  retrasos.set("lento", 30).set("ultimo", 150);
  await pulsar("lento", 5);
  await pulsar("ultimo", 60);
  // La de «lento» ya ha vuelto, pero no es la última: sigue cargando y no se pinta su contexto.
  expect(estado()?.getAttribute("data-pidiendo")).toBe("true");
  expect(estado()?.getAttribute("data-personaje")).toBe("");
  await act(async () => {
    await espera(150);
  });
  expect(estado()?.getAttribute("data-pidiendo")).toBe("false");
  expect(estado()?.getAttribute("data-personaje")).toBe("ultimo");
});

test("quitar el personaje mientras se pide su contexto apaga el «cargando» y lo limpia", async () => {
  await act(async () => raiz.render(<Prueba />));
  retrasos.set("lento", 40);
  await pulsar("lento", 5);
  await pulsar("ninguno", 80);
  expect(estado()?.getAttribute("data-pidiendo")).toBe("false");
  expect(estado()?.getAttribute("data-personaje")).toBe("");
});
