"use client";

import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
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
  const actual = useSyncExternalStore(suscribir, leerPreferencia, () => "system" as PreferenciaTema);
  return (
    <ToggleGroup
      value={[actual]}
      onValueChange={(v) => {
        const nuevo = (v[0] as PreferenciaTema | undefined) ?? actual;
        aplicarTema(nuevo);
        for (const fn of oyentes) fn();
        // Con sesión, se guarda en la cuenta para que el tema siga al usuario en todos sus dispositivos. El cliente
        // de autenticación se descarga aquí, al usarlo: el selector está en todas las páginas y casi nunca se toca.
        if (document.documentElement.dataset.temaUsuario !== undefined) {
          void import("@/lib/auth-cliente")
            .then(({ authCliente }) => authCliente.updateUser({ tema: nuevo }))
            .then(
              (r) => r.error && console.warn("[tema] no se ha guardado en la cuenta:", r.error.code ?? r.error.status),
            )
            .catch(() => console.warn("[tema] no se ha guardado en la cuenta: sin conexión"));
        }
      }}
      aria-label="Tema de la interfaz"
      className="inline-flex gap-1 rounded-full border border-borde bg-superficie p-1"
    >
      {OPCIONES.map(({ valor, etiqueta, icono: Icono }) => (
        <Toggle
          key={valor}
          value={valor}
          aria-label={etiqueta}
          className="flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-texto-suave transition-colors duration-(--motion-fast) data-pressed:bg-acento data-pressed:text-sobre-acento"
        >
          <Icono className="size-4" aria-hidden />
          <span className="hidden sm:inline">{etiqueta}</span>
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
