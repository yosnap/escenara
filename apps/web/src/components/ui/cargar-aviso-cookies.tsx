"use client";

import { type ComponentType, useEffect, useState } from "react";

/** El panel se descarga después de hidratar: no encarece el primer JS de editores y montajes. */
export function CargarAvisoCookies() {
  const [Panel, setPanel] = useState<ComponentType | null>(null);
  const [fallo, setFallo] = useState(false);
  useEffect(() => {
    let montado = true;
    import("./aviso-cookies")
      .then((m) => {
        if (montado) setPanel(() => m.AvisoCookies);
      })
      .catch(() => {
        if (montado) setFallo(true);
      });
    return () => {
      montado = false;
    };
  }, []);
  if (Panel) return <Panel />;
  return (
    <a href="/legal/cookies" className="inline-flex min-h-11 items-center text-sm text-acento underline">
      {fallo ? "Consultar configuración de cookies" : "Cookies y almacenamiento"}
    </a>
  );
}
