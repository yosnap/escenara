"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useId, useSyncExternalStore } from "react";
import { aplicarTema, leerPreferencia, type PreferenciaTema } from "@/lib/tema";

const OPCIONES: { valor: PreferenciaTema; etiqueta: string; icono: typeof Sun }[] = [
  { valor: "system", etiqueta: "Sistema", icono: Monitor },
  { valor: "light", etiqueta: "Claro", icono: Sun },
  { valor: "dark", etiqueta: "Oscuro", icono: Moon },
];

const oyentes = new Set<() => void>();
const suscribir = (fn: () => void) => {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
};

/** Selector de tema persistente: sistema, claro u oscuro. */
export function SelectorTema() {
  const grupo = useId();
  const actual = useSyncExternalStore(suscribir, leerPreferencia, () => "system" as PreferenciaTema);
  const cambiarTema = (nuevo: PreferenciaTema) => {
    aplicarTema(nuevo);
    for (const fn of oyentes) fn();
    // Con sesión, se guarda en la cuenta para que el tema siga al usuario en todos sus dispositivos. El cliente
    // de autenticación se descarga aquí, al usarlo: el selector está en todas las páginas y casi nunca se toca.
    if (document.documentElement.dataset.temaUsuario !== undefined) {
      void import("@/lib/auth-cliente")
        .then(({ authCliente }) => authCliente.updateUser({ tema: nuevo }))
        .then((r) => r.error && console.warn("[tema] no se ha guardado en la cuenta:", r.error.code ?? r.error.status))
        .catch(() => console.warn("[tema] no se ha guardado en la cuenta: sin conexión"));
    }
  };
  return (
    <fieldset className="inline-flex gap-1 rounded-full border border-borde bg-superficie p-1">
      <legend className="sr-only">Tema de la interfaz</legend>
      {OPCIONES.map(({ valor, etiqueta, icono: Icono }) => (
        <label
          key={valor}
          title={etiqueta}
          className={`relative flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-full p-2 transition-colors duration-(--motion-fast) focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-acento ${actual === valor ? "bg-acento text-sobre-acento" : "text-texto-suave"}`}
        >
          <input
            type="radio"
            name={`tema-${grupo}`}
            value={valor}
            aria-label={etiqueta}
            checked={actual === valor}
            onChange={() => cambiarTema(valor)}
            className="sr-only"
          />
          <Icono className="size-4" aria-hidden />
        </label>
      ))}
    </fieldset>
  );
}
