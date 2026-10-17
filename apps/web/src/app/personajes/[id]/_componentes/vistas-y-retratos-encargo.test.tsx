import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import { Window } from "happy-dom";
import { act, type ComponentProps, type ComponentType, lazy, Suspense } from "react";
import { createRoot, type Root } from "react-dom/client";
import { calcularCobertura } from "@/lib/captura-personaje";
import type { Estimacion, HuecosDeCola, TrabajoVista } from "@/lib/generacion";
import type { PersonajeVista } from "@/lib/personajes";

/**
 * El diálogo de Base UI no se abre con happy-dom (su portal no llega a montarse). Se sustituye por uno que pinta
 * lo que recibe: lo que se comprueba es **qué vistas le pasa el panel** para confirmar y cuáles deja para después.
 */
const dialogo = await import("./dialogo-todas-las-vistas");
mock.module("./dialogo-todas-las-vistas", () => ({
  ...dialogo,
  DialogoTodasLasVistas: (p: ComponentProps<typeof dialogo.DialogoTodasLasVistas>) => (
    <output data-dialogo-vistas>
      confirma: {p.vistas.join(",")} · después: {p.pendientes.join(",")}
    </output>
  ),
}));
/**
 * `next/dynamic` sin servidor no llega a cargar en happy-dom: se sustituye por `lazy`, que hace lo mismo. Y el
 * seguimiento real sondea cada varios segundos: se sustituye por uno que avisa de un cambio al pulsarlo, que es lo
 * que hace el real cuando el trabajo cambia de estado.
 */
mock.module("next/dynamic", () => ({
  default: (cargar: () => Promise<ComponentType<Record<string, unknown>>>) => {
    const Perezoso = lazy(async () => ({ default: await cargar() }));
    return (props: Record<string, unknown>) => (
      <Suspense fallback={null}>
        <Perezoso {...props} />
      </Suspense>
    );
  },
}));
mock.module("./seguimiento-personaje", () => ({
  SeguimientoPersonaje: (p: { trabajo: TrabajoVista; onCambio?: (t: TrabajoVista) => void }) => (
    <button
      type="button"
      data-terminar={p.trabajo.id}
      onClick={() => p.onCambio?.({ ...p.trabajo, estado: "fallido" })}
    >
      Terminar
    </button>
  ),
}));
const { PanelCobertura } = await import("./panel-cobertura");
const { PanelRetratos } = await import("./panel-retratos");

/**
 * Lo que se encarga es lo que se ve: tras recargar, una vista que ya se está generando no se vuelve a ofrecer (ni a
 * cobrar), y la pantalla nunca ofrece más retratos ni vistas de los que caben en el tope de trabajos simultáneos.
 */

let ventana: Window;
let raiz: Root;
let peticion: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;
const anteriores = new Map<string, PropertyDescriptor | undefined>();
let huecos: HuecosDeCola = { maximo: 3, enMarcha: 0, libres: 3 };

const enCurso = {
  id: "trabajo-perfil",
  tipo: "fotograma",
  estado: "en_curso",
  creadoEn: new Date().toISOString(),
  terminadoEn: null,
  medio: null,
  error: null,
  excesoCreditos: null,
} as TrabajoVista;

const estimacion = {
  tipo: "fotograma",
  modelo: "nano-banana-2-lite",
  nombreModelo: "Nano Banana 2 Lite",
  conVoz: false,
  unidad: "imagen",
  creditos: 4,
  euros: 0.02,
  saldo: 5000,
  alcanza: true,
  superaUmbral: false,
  umbral: 1000,
  fuente: "kie",
  comprobado: "2026-10-01",
  precioAntiguo: false,
  sello: "sello",
  traduccion: null,
  segundos: null,
  duraciones: [],
  sinReferencia: true,
} as Estimacion;

const controles = { estado: "listo", reglasVersion: "1", comprobaciones: [] };

/** Inventado con cara y frontal, sin ninguna otra vista: le faltan cuatro. */
const personaje = {
  id: "p1",
  nombre: "Brisa",
  tipo: "persona",
  inventado: true,
  estiloAnimado: "realista",
  fotogramaMaestro: null,
  totalReferencias: 1,
  totalGeneradas: 1,
  minimoReferencias: 3,
  referencias: [],
  cobertura: calcularCobertura("persona", [{ vistaClave: "frontal", origen: "vista_generada" }], true, false),
  vistasEnCurso: [{ vista: "perfil_izquierdo", trabajo: enCurso }],
} as unknown as PersonajeVista;

const UMBRALES = { ladoMinimo: 512, nitidezMinima: 0, luminosidadMinima: 0, luminosidadMaxima: 255, caraMinima: 0 };

beforeEach(() => {
  huecos = { maximo: 3, enMarcha: 0, libres: 3 };
  ventana = new Window({ url: "http://localhost/personajes/p1" });
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
  })) {
    anteriores.set(clave, Object.getOwnPropertyDescriptor(globalThis, clave));
    Object.defineProperty(globalThis, clave, { value: valor, writable: true, configurable: true });
  }
  peticion = spyOn(globalThis, "fetch").mockImplementation((async (url: RequestInfo | URL, _init?: RequestInit) => {
    const ruta = String(url);
    if (ruta.includes("/api/generacion/huecos")) return Response.json(huecos);
    if (ruta.includes("/api/generacion/estimacion")) return Response.json(estimacion);
    if (ruta.includes("/controles")) return Response.json(controles);
    if (ruta.includes("/retratos") && _init?.method === "POST") {
      const { cantidad } = JSON.parse(String(_init.body)) as { cantidad: number };
      return Response.json({
        trabajos: Array.from({ length: cantidad }, (_, i) => ({ ...enCurso, id: `retrato-${i}` })),
        aviso: "",
      });
    }
    if (ruta.includes("/retratos")) return Response.json({ candidatos: [] });
    if (ruta.includes("/trabajos/")) return Response.json(enCurso);
    return Response.json({});
  }) as typeof fetch);
  raiz = createRoot(ventana.document.body.appendChild(ventana.document.createElement("div")) as unknown as HTMLElement);
});

afterEach(async () => {
  await act(async () => raiz.unmount());
  peticion.mockRestore();
  for (const [clave, descriptor] of anteriores) {
    if (descriptor) Object.defineProperty(globalThis, clave, descriptor);
    else Reflect.deleteProperty(globalThis, clave);
  }
  anteriores.clear();
  await ventana.happyDOM.close();
});

const botones = () => [...ventana.document.querySelectorAll("button")].map((b) => b.textContent?.trim() ?? "");
const pulsar = async (texto: string) => {
  const boton = [...ventana.document.querySelectorAll("button")].find((b) => b.textContent?.trim() === texto);
  expect(boton).toBeDefined();
  await act(async () => (boton as unknown as HTMLButtonElement).click());
  // Las consultas del botón y el diálogo que abren terminan en las tareas siguientes.
  await act(async () => new Promise((resolver) => setTimeout(resolver, 50)));
};
const tarjeta = (etiqueta: string) =>
  [...ventana.document.querySelectorAll("li")].find((li) => li.textContent?.includes(etiqueta))?.textContent ?? "";

test("tras recargar, una vista que ya se está generando se ve en curso y no se ofrece «Generarla»", async () => {
  await act(async () =>
    raiz.render(
      <PanelCobertura
        personaje={personaje}
        umbrales={UMBRALES}
        claveDeGeneracion={{ ok: true }}
        onPersonaje={() => {}}
        onVistaEncolada={() => {}}
      />,
    ),
  );
  expect(tarjeta("Perfil izquierdo")).toContain("Generándose");
  expect(tarjeta("Perfil izquierdo")).not.toContain("Generarla");
  expect(tarjeta("Perfil derecho")).toContain("Generarla");
  // El lote tampoco la cuenta: faltan cuatro, pero una ya está en marcha.
  expect(botones()).toContain("Generar las 3 vistas que faltan");
});

test("el lote de vistas solo confirma las que caben ahora y dice cuáles quedan para después", async () => {
  huecos = { maximo: 3, enMarcha: 1, libres: 2 };
  await act(async () =>
    raiz.render(
      <PanelCobertura
        personaje={personaje}
        umbrales={UMBRALES}
        claveDeGeneracion={{ ok: true }}
        onPersonaje={() => {}}
        onVistaEncolada={() => {}}
      />,
    ),
  );
  await pulsar("Generar las 3 vistas que faltan");
  // Perfil izquierdo ya está en marcha; de las tres que faltan caben dos y la tercera queda para después.
  expect(ventana.document.querySelector("[data-dialogo-vistas]")?.textContent).toBe(
    "confirma: perfil_derecho,tres_cuartos · después: cuerpo_completo",
  );
});

test("los retratos se limitan a los que caben en la cola, antes de confirmar nada", async () => {
  await act(async () =>
    raiz.render(<PanelRetratos personaje={personaje} medios={[]} huecosIniciales={null} onPersonaje={() => {}} />),
  );
  expect(botones()).toContain("Ver lo que cuesta generar 4 retratos");
  await pulsar("Ver lo que cuesta generar 4 retratos");
  expect(botones()).toContain("Generar 3 retratos");
  expect(botones()).not.toContain("Generar 4 retratos");
  // El tope de la instalación (tres a la vez) se dice donde se promete cuántos se pueden pedir.
  expect(ventana.document.body.textContent).toContain("de uno a tres retratos a la vez");
});

const marcar = async (etiqueta: string) => {
  const casilla = [...ventana.document.querySelectorAll("label")]
    .find((l) => l.textContent?.includes(etiqueta))
    ?.querySelector('input[type="checkbox"]') as unknown as HTMLInputElement | undefined;
  expect(casilla).toBeDefined();
  await act(async () => casilla?.click());
};

test("tras encargar bien los retratos no aparece ningún bloqueo: el encargo se cierra y solo se ve su aviso", async () => {
  await act(async () =>
    raiz.render(<PanelRetratos personaje={personaje} medios={[]} huecosIniciales={null} onPersonaje={() => {}} />),
  );
  await pulsar("Ver lo que cuesta generar 4 retratos");
  await marcar("Puedo usar lo que se genere");
  await pulsar("Generar 3 retratos");
  const texto = ventana.document.body.textContent ?? "";
  expect(texto).toContain("Se han encargado 3 de 3 retratos");
  // La cola está llena justo porque se acaba de encargar: no es un bloqueo que haya que resolver, solo se informa.
  expect(ventana.document.querySelector('[data-alerta="bloqueo"]')).toBeNull();
  expect(texto).toContain("Ahora no cabe ningún retrato más");
  expect(botones()).not.toContain("Generar 1 retrato");
});

test("el número de retratos parte de los huecos libres de la cola, también al volver a la ficha", async () => {
  await act(async () =>
    raiz.render(
      <PanelRetratos
        personaje={personaje}
        medios={[]}
        huecosIniciales={{ maximo: 3, enMarcha: 1, libres: 2 }}
        onPersonaje={() => {}}
      />,
    ),
  );
  expect(botones()).toContain("Ver lo que cuesta generar 2 retratos");
  // Con la cola llena tras un encargo (al recargar o al volver a la pestaña) no se ofrecen cuatro, ni uno.
  await act(async () =>
    raiz.render(
      <PanelRetratos
        key="otra"
        personaje={personaje}
        medios={[]}
        huecosIniciales={{ maximo: 3, enMarcha: 3, libres: 0 }}
        onPersonaje={() => {}}
      />,
    ),
  );
  // No se ofrece ningún retrato: se dice por qué y cuándo se podrá.
  expect(botones().some((b) => b.startsWith("Ver lo que cuesta"))).toBe(false);
  expect(ventana.document.body.textContent).toContain("3 trabajos en marcha y esta instalación permite 3");
});

test("tras encargar, el número se recorta a lo que cabe, dice por qué y no vuelve a cuatro", async () => {
  await act(async () =>
    raiz.render(<PanelRetratos personaje={personaje} medios={[]} huecosIniciales={null} onPersonaje={() => {}} />),
  );
  await pulsar("Ver lo que cuesta generar 4 retratos");
  await marcar("Puedo usar lo que se genere");
  await pulsar("Generar 3 retratos");
  // Buscar los terminados vuelve a leer la cola: dos han acabado y caben dos más, no cuatro.
  huecos = { maximo: 3, enMarcha: 1, libres: 2 };
  await pulsar("Buscar retratos terminados");
  expect(botones()).toContain("Ver lo que cuesta generar 2 retratos");
  expect(botones()).not.toContain("Ver lo que cuesta generar 4 retratos");
  expect(ventana.document.body.textContent).toContain("Ahora puedes encargar como máximo 2 retratos");
});

test("la pestaña promete los retratos que el selector deja pedir, no cuatro", async () => {
  await act(async () =>
    raiz.render(
      <PanelRetratos
        personaje={personaje}
        medios={[]}
        huecosIniciales={{ maximo: 3, enMarcha: 0, libres: 3 }}
        onPersonaje={() => {}}
      />,
    ),
  );
  const texto = ventana.document.body.textContent ?? "";
  expect(texto).toContain("de uno a tres retratos a la vez");
  expect(texto).not.toContain("cuatro");
  expect(botones()).toContain("Ver lo que cuesta generar 3 retratos");
  // Con la cola libre no hay recorte que explicar.
  expect(texto).not.toContain("Ahora puedes encargar como máximo");
});

test("tras encargar tres y elegir la cara, el selector vuelve a los tres que caben, no a otro número", async () => {
  const pintar = (huecosDeLaPagina: HuecosDeCola) =>
    act(async () =>
      raiz.render(
        <PanelRetratos personaje={personaje} medios={[]} huecosIniciales={huecosDeLaPagina} onPersonaje={() => {}} />,
      ),
    );
  await pintar({ maximo: 3, enMarcha: 0, libres: 3 });
  await pulsar("Ver lo que cuesta generar 3 retratos");
  await marcar("Puedo usar lo que se genere");
  await pulsar("Generar 3 retratos");
  expect(ventana.document.body.textContent).toContain("Ahora no cabe ningún retrato más");
  // Elegir la cara refresca la página: llegan los huecos de ahora, con los tres retratos ya terminados.
  await pintar({ maximo: 3, enMarcha: 0, libres: 3 });
  expect(botones()).toContain("Ver lo que cuesta generar 3 retratos");
});

test("si el trabajo de una vista en curso falla, la vista se vuelve a ofrecer", async () => {
  await act(async () =>
    raiz.render(
      <PanelCobertura
        personaje={personaje}
        umbrales={UMBRALES}
        claveDeGeneracion={{ ok: true }}
        onPersonaje={() => {}}
        onVistaEncolada={() => {}}
      />,
    ),
  );
  expect(tarjeta("Perfil izquierdo")).toContain("Generándose");
  // El seguimiento consulta el trabajo, lo encuentra fallido y la tarjeta deja de darlo por en curso.
  await act(async () => new Promise((resolver) => setTimeout(resolver, 20)));
  await pulsar("Terminar");
  expect(tarjeta("Perfil izquierdo")).toContain("Generarla");
});
