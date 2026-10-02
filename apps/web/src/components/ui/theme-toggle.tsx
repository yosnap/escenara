"use client";

import { type ReactNode, useId, useSyncExternalStore } from "react";
import { aplicarTema, leerPreferencia, type PreferenciaTema } from "@/lib/tema";

// Geometría estática: estos tres iconos están en todas las páginas y no necesitan un componente de iconos.
const OPCIONES: { valor: PreferenciaTema; etiqueta: string; icono: ReactNode }[] = [
  {
    valor: "system",
    etiqueta: "Sistema",
    icono: (
      <>
        <rect width="20" height="14" x="2" y="3" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </>
    ),
  },
  {
    valor: "light",
    etiqueta: "Claro",
    icono: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5" />
      </>
    ),
  },
  { valor: "dark", etiqueta: "Oscuro", icono: <path d="M21 12.5A9 9 0 1 1 11.5 3 6.5 6.5 0 0 0 21 12.5Z" /> },
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
      {OPCIONES.map(({ valor, etiqueta, icono }) => (
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
          <svg
            className="size-4"
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {icono}
          </svg>
        </label>
      ))}
    </fieldset>
  );
}
