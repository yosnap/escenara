import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ModeloElegible } from "@/lib/catalogo";
import { evaluacionPendiente } from "@/lib/controles";
import type { Estimacion } from "@/lib/generacion";
import type { PersonajeElegible } from "@/lib/personajes";

/**
 * El desplegable de Base UI no se abre con eventos sintéticos de happy-dom. Para poder **elegir** un modelo se
 * envuelve el selector real (que sigue pintando su etiqueta, lo que comprueban los tests) con un botón oculto por
 * modelo que llama a su `onCambio`, que es lo mismo que hace la opción del desplegable al pulsarla.
 */
const modulo = await import("@/components/ui/modelo");
const SelectorReal = modulo.SelectorModelo;
mock.module("@/components/ui/modelo", () => ({
  ...modulo,
  SelectorModelo: (p: ComponentProps<typeof SelectorReal>) => (
    <>
      <SelectorReal {...p} />
      {p.modelos.map((m) => (
        <button
          key={m.modelo}
          type="button"
          hidden
          data-elegir-modelo={m.modelo}
          onClick={() => p.onCambio(m.modelo)}
        />
      ))}
    </>
  ),
}));
const { VistaCrear } = await import("./vista-crear");

/**
 * El modelo del fotograma elegido en «Crear» sobrevive a los cambios de sujeto: se pide la estimación con él si
 * sigue valiendo en el modo nuevo, no se pide nada si el sujeto no cambia y una respuesta lenta no pisa una
 * elección posterior. Se monta la pantalla entera con un `fetch` falso: no sale nada a la red.
 */

let ventana: Window;
let raiz: Root;
const pedidas: string[] = [];
/** Retraso por petición de estimación, en el orden en que llegan (ms). Lo que no aparece responde enseguida. */
let retrasos: number[] = [];
const anteriores = new Map<string, PropertyDescriptor | undefined>();

const est = (modelo: string, sinReferencia = false) =>
  ({
    tipo: "fotograma",
    modelo,
    nombreModelo: modelo.toUpperCase(),
    conVoz: false,
    unidad: "imagen",
    creditos: 6,
    euros: 0.03,
    saldo: null,
    alcanza: true,
    superaUmbral: false,
    umbral: 500,
    fuente: "t",
    comprobado: "2026-10-01",
    precioAntiguo: false,
    sello: `s-${modelo}`,
    traduccion: null,
    segundos: null,
    duraciones: [],
    sinReferencia,
  }) as unknown as Estimacion;
const mod = (modelo: string) =>
  ({
    modelo,
    nombre: `Nombre ${modelo}`,
    conVoz: false,
    unidad: "imagen",
    estado: "validado",
    creditos: 6,
    precioPublicado: true,
    duracionesConCoste: [],
    duraciones: [],
    maximoReferencias: 10,
  }) as unknown as ModeloElegible;
const catalogo = (modelo: string) => ({
  presets: [],
  incompatibles: {},
  plantillas: [],
  modelo,
  limites: { nombre: modelo, proporciones: ["9:16"], duraciones: [], maximoReferencias: 10 },
});
const personaje = (id: string) =>
  ({
    id,
    nombre: `Persona ${id}`,
    tipo: "realista",
    estado: "listo",
    totalReferencias: 4,
    portada: null,
  }) as unknown as PersonajeElegible;

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  pedidas.length = 0;
  retrasos = [];
  ventana = new Window({ url: "http://localhost:3021/crear" });
  let estimaciones = 0;
  const fetchFalso = async (url: string) => {
    pedidas.push(String(url));
    const u = new URL(String(url), "http://localhost");
    let cuerpo: unknown = {};
    if (u.pathname.endsWith("/estimacion")) {
      // Igual que el servidor: sin `modelo=`, responde con el predeterminado del modo.
      const sinImagen = u.searchParams.get("sinImagen") === "1";
      const modelo = u.searchParams.get("modelo") ?? (sinImagen ? "t2i-por-defecto" : "edicion-por-defecto");
      const retraso = retrasos[estimaciones++] ?? 0;
      if (retraso) await espera(retraso);
      cuerpo = est(modelo, sinImagen);
    } else if (u.pathname.includes("presets") || u.pathname.includes("catalogo")) {
      cuerpo = catalogo(u.searchParams.get("modelo") ?? "x");
    } else if (u.pathname.includes("lugares")) {
      cuerpo = [];
    } else if (u.pathname.includes("controles")) {
      cuerpo = evaluacionPendiente("v");
    } else if (u.pathname.includes("contexto")) {
      const modelo = u.searchParams.get("modelo") ?? "x";
      cuerpo = {
        personajeId: u.pathname.split("/")[3],
        nombre: "P",
        versionId: "v",
        versionNumero: 1,
        conContexto: true,
        referencias: [],
        maximoDelModelo: 10,
        modelo,
      };
    }
    return new Response(JSON.stringify(cuerpo), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  for (const [clave, valor] of Object.entries({
    window: ventana,
    document: ventana.document,
    navigator: ventana.navigator,
    IS_REACT_ACT_ENVIRONMENT: true,
    HTMLElement: ventana.HTMLElement,
    Element: ventana.Element,
    Node: ventana.Node,
    getComputedStyle: ventana.getComputedStyle.bind(ventana),
    requestAnimationFrame: (f: () => void) => {
      f();
      return 0;
    },
    cancelAnimationFrame: () => {},
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

const props = (modelo: string, personajeInicial: string | null) => ({
  estimacionFotograma: est(modelo, personajeInicial === null),
  estimacionAnimacion: { ...est("clip"), tipo: "animacion" } as Estimacion,
  // «comun» está en las dos listas: es válido con imagen de partida y sin ella.
  modelosFotograma: [mod("edicion-por-defecto"), mod("edicion-b"), mod("comun")],
  modelosSinImagen: [mod("t2i-por-defecto"), mod("t2i-elegido"), mod("comun")],
  modelosClip: [mod("clip")],
  deposito: {
    autorizado: null,
    reservado: 0,
    retenido: 0,
    trabajosEnRevision: 0,
    llamadasDeTextoColgadas: 0,
    revisionesColgadas: 0,
    consumido: 0,
    disponible: null,
    topeTrabajo: null,
    consumidoEuros: 0,
  },
  cola: { enCola: 0, enMarcha: 0, workerActivo: true, ultimoLatido: null },
  personajes: [personaje("p1"), personaje("p2")],
  personajeInicial,
  contextoInicial: null,
  catalogoFotogramaInicial: catalogo(modelo),
  catalogoClipInicial: { ...catalogo("clip"), plantillas: [] },
  controlesIniciales: evaluacionPendiente("v"),
  pasoPedido: "sujeto",
});

const montar = async (modelo: string, personajeInicial: string | null) => {
  await act(async () =>
    raiz.render(<VistaCrear {...(props(modelo, personajeInicial) as unknown as ComponentProps<typeof VistaCrear>)} />),
  );
};
const panel = () => ventana.document.querySelector("[data-panel-paso='sujeto']");
/** Valor real del selector de modelo (el campo oculto del formulario). */
const valorDelModelo = () =>
  [...(panel()?.querySelectorAll("input") ?? [])]
    .map((i) => (i as unknown as HTMLInputElement).value)
    .find((v) => v.length > 0 && v !== "on");
/** Lo que se lee en el disparador del selector. */
const etiquetaDelModelo = () => panel()?.querySelector("[role=combobox]")?.textContent ?? "";
const pulsar = async (texto: string, ms = 30) => {
  const boton = [...ventana.document.querySelectorAll("button")].find((b) => b.textContent?.includes(texto));
  if (!boton) throw new Error(`No está el botón «${texto}»`);
  await act(async () => {
    (boton as unknown as HTMLButtonElement).click();
    await espera(ms);
  });
};
const estimacionesPedidas = () => pedidas.filter((u) => u.includes("/estimacion"));

test("cambiar a otro personaje conserva el modelo elegido y lo pide con su nombre", async () => {
  await montar("edicion-b", "p1");
  await pulsar("Persona p2");
  expect(estimacionesPedidas()).toHaveLength(1);
  expect(estimacionesPedidas()[0]).toContain("modelo=edicion-b");
  expect(valorDelModelo()).toBe("edicion-b");
  expect(etiquetaDelModelo()).toContain("Nombre edicion-b");
});

test("pasar a «Sin personaje» conserva el modelo si también vale sin imagen de partida", async () => {
  await montar("comun", "p1");
  await pulsar("Sin personaje");
  expect(estimacionesPedidas()).toHaveLength(1);
  expect(estimacionesPedidas()[0]).toContain("sinImagen=1");
  expect(estimacionesPedidas()[0]).toContain("modelo=comun");
  expect(valorDelModelo()).toBe("comun");
});

test("si el modelo no existe en el modo nuevo, cae al predeterminado y la etiqueta lo dice", async () => {
  await montar("edicion-b", "p1");
  await pulsar("Sin personaje");
  expect(estimacionesPedidas()[0]).not.toContain("modelo=");
  expect(valorDelModelo()).toBe("t2i-por-defecto");
  expect(etiquetaDelModelo()).toContain("Nombre t2i-por-defecto");
});

test("volver a pulsar «Sin personaje» estando ya marcado no pide nada ni cambia el modelo", async () => {
  await montar("t2i-elegido", null);
  pedidas.length = 0;
  await pulsar("Sin personaje");
  expect(pedidas).toEqual([]);
  expect(valorDelModelo()).toBe("t2i-elegido");
});

test("una respuesta lenta de un cambio de sujeto no pisa el sujeto elegido después", async () => {
  await montar("edicion-b", "p1");
  // La primera estimación (Persona p2) tarda; la segunda («Sin personaje») llega antes.
  retrasos = [80, 0];
  await pulsar("Persona p2", 0);
  await pulsar("Sin personaje", 150);
  expect(estimacionesPedidas()).toHaveLength(2);
  expect(valorDelModelo()).toBe("t2i-por-defecto");
  // Lo que se pide después de la respuesta vieja (catálogo) no es con el modelo de la respuesta descartada.
  const ultimoCatalogo = pedidas.filter((u) => u.includes("presets") || u.includes("catalogo")).at(-1);
  expect(ultimoCatalogo).toContain("modelo=t2i-por-defecto");
});

/** Elige un modelo como lo haría la opción del desplegable. */
const elegirModeloEnPantalla = async (modelo: string) => {
  const boton = panel()?.querySelector(`[data-elegir-modelo='${modelo}']`) as unknown as HTMLButtonElement | null;
  if (!boton) throw new Error(`No está el modelo «${modelo}» en el selector`);
  await act(async () => {
    boton.click();
    await espera(0);
  });
};

test("elegir modelo y cambiar de personaje enseguida conserva el modelo recién elegido", async () => {
  await montar("edicion-por-defecto", "p1");
  // La estimación del modelo elegido tarda; la del cambio de personaje llega antes y es la que manda.
  retrasos = [80, 0];
  await elegirModeloEnPantalla("edicion-b");
  await pulsar("Persona p2", 150);
  const estimaciones = estimacionesPedidas();
  expect(estimaciones).toHaveLength(2);
  expect(estimaciones[0]).toContain("modelo=edicion-b");
  expect(estimaciones[1]).toContain("modelo=edicion-b");
  expect(valorDelModelo()).toBe("edicion-b");
  expect(etiquetaDelModelo()).toContain("Nombre edicion-b");
});
