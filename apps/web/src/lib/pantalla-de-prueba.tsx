import { expect } from "bun:test";
import { Window } from "happy-dom";
import { act, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Dialogo } from "@/components/ui/overlay";

/**
 * **Una pantalla de verdad para las pruebas de interacción**: una ventana de happy-dom puesta como la global, una raíz
 * de React y ayudas para pulsar y escribir como lo haría una persona. Cada prueba la monta y la desmonta; lo que la
 * ventana sustituye vuelve a su sitio al desmontarla.
 */
export interface PantallaDePrueba {
  ventana: Window;
  pintar: (nodo: ReactNode) => Promise<void>;
  /** Pulsa el botón cuyo texto es exactamente ese y deja terminar lo que encadena. */
  pulsar: (texto: string) => Promise<void>;
  /** Escribe en el control de texto con esa etiqueta, como si se tecleara. */
  escribir: (etiqueta: string, valor: string) => Promise<void>;
  /** Textos de los botones a la vista. */
  botones: () => string[];
  texto: () => string;
  desmontar: () => Promise<void>;
}

const esperar = () => act(async () => new Promise((resolver) => setTimeout(resolver, 30)));

export function montarPantalla(url: string): PantallaDePrueba {
  const ventana = new Window({ url });
  const anteriores = new Map<string, PropertyDescriptor | undefined>();
  for (const [clave, valor] of Object.entries({
    window: ventana,
    document: ventana.document,
    navigator: ventana.navigator,
    IS_REACT_ACT_ENVIRONMENT: true,
    HTMLElement: ventana.HTMLElement,
    HTMLInputElement: ventana.HTMLInputElement,
    HTMLTextAreaElement: ventana.HTMLTextAreaElement,
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
  const raiz: Root = createRoot(
    ventana.document.body.appendChild(ventana.document.createElement("div")) as unknown as HTMLElement,
  );
  const botonesVisibles = () => [...ventana.document.querySelectorAll("button")];

  return {
    ventana,
    pintar: async (nodo) => {
      await act(async () => raiz.render(nodo));
      await esperar();
    },
    pulsar: async (texto) => {
      const boton = botonesVisibles().find((b) => b.textContent?.trim() === texto);
      expect(boton, `no hay ningún botón «${texto}»`).toBeDefined();
      await act(async () => (boton as unknown as HTMLButtonElement).click());
      await esperar();
    },
    escribir: async (etiqueta, valor) => {
      const label = [...ventana.document.querySelectorAll("label")].find((l) => l.textContent?.includes(etiqueta));
      const control = label?.getAttribute("for") ? ventana.document.getElementById(label.getAttribute("for") ?? "") : null;
      expect(control, `no hay ningún campo «${etiqueta}»`).not.toBeNull();
      const elemento = control as unknown as HTMLInputElement | HTMLTextAreaElement;
      // El setter del prototipo, no el de la instancia: así React ve un valor nuevo, como al teclear.
      let prototipo: object | null = Object.getPrototypeOf(elemento);
      while (prototipo && !Object.getOwnPropertyDescriptor(prototipo, "value")) {
        prototipo = Object.getPrototypeOf(prototipo);
      }
      const asignar = prototipo ? Object.getOwnPropertyDescriptor(prototipo, "value")?.set : undefined;
      if (!asignar) throw new Error(`El campo «${etiqueta}» no tiene setter de valor`);
      await act(async () => {
        // React DOM se carga antes de que exista `window` y escucha los cambios como en un navegador sin el evento
        // `input`: con el foco puesto y una tecla soltada. Se mandan todos para no depender de cuál use.
        elemento.dispatchEvent(new ventana.FocusEvent("focusin", { bubbles: true }) as unknown as Event);
        asignar.call(elemento, valor);
        elemento.dispatchEvent(new ventana.Event("input", { bubbles: true }) as unknown as Event);
        elemento.dispatchEvent(new ventana.KeyboardEvent("keyup", { bubbles: true }) as unknown as Event);
      });
    },
    botones: () => botonesVisibles().map((b) => b.textContent?.trim() ?? ""),
    texto: () => ventana.document.body.textContent ?? "",
    desmontar: async () => {
      await act(async () => raiz.unmount());
      for (const [clave, descriptor] of anteriores) {
        if (descriptor) Object.defineProperty(globalThis, clave, descriptor);
        else Reflect.deleteProperty(globalThis, clave);
      }
      await ventana.happyDOM.close();
    },
  };
}

/**
 * El diálogo de Base UI no se abre con happy-dom (su portal no llega a montarse). En las pruebas de interacción se
 * sustituye por uno que pinta título, contenido y pie mientras está abierto, que es lo que se comprueba.
 */
export function DialogoDePrueba({ abierto, titulo, descripcion, children, pie }: ComponentProps<typeof Dialogo>) {
  if (!abierto) return null;
  return (
    <section data-dialogo={titulo}>
      <h2>{titulo}</h2>
      {descripcion && <p>{descripcion}</p>}
      {children}
      {pie}
    </section>
  );
}
