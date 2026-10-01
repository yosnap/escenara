"use client";

import { useEffect, useState } from "react";
import { comprobarSesion } from "@/lib/estado-sesion";

/** Renueva por HTTP con actividad; nunca recarga ni tira los campos al perder la sesión. */
export function AvisoSesion() {
  const [terminada, setTerminada] = useState(false);
  useEffect(() => {
    let actividad = Date.now();
    let intento = 0;
    let controlador: AbortController | undefined;
    let desmontado = false;
    const comprobar = async () => {
      if (document.hidden || Date.now() - actividad > 15 * 60_000 || Date.now() - intento < 30_000) return;
      intento = Date.now();
      controlador?.abort();
      controlador = new AbortController();
      const actual = controlador;
      const timeout = window.setTimeout(() => actual.abort(), 10_000);
      const valida = await comprobarSesion(actual.signal);
      window.clearTimeout(timeout);
      if (!desmontado && !actual.signal.aborted && valida !== null) setTerminada(!valida);
    };
    const activa = () => {
      actividad = Date.now();
    };
    const volver = () => {
      activa();
      void comprobar();
    };
    const visible = () => {
      if (!document.hidden) volver();
    };
    document.addEventListener("pointerdown", activa, { passive: true });
    document.addEventListener("keydown", activa);
    document.addEventListener("scroll", activa, { passive: true, capture: true });
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("focus", volver);
    const intervalo = window.setInterval(() => void comprobar(), 5 * 60_000);
    void comprobar();
    return () => {
      desmontado = true;
      controlador?.abort();
      window.clearInterval(intervalo);
      document.removeEventListener("pointerdown", activa);
      document.removeEventListener("keydown", activa);
      document.removeEventListener("scroll", activa, true);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("focus", volver);
    };
  }, []);
  if (!terminada) return null;
  return (
    <div role="alert" className="mt-3 rounded-control border-2 border-aviso bg-superficie p-3 text-sm text-texto">
      <p>
        Tu sesión ha caducado o se ha cerrado. Los campos de esta pantalla se mantienen; no recargues antes de
        copiarlos.
      </p>
      <a
        href="/entrar?aviso=necesaria"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center font-semibold text-acento underline"
      >
        Volver a entrar (se abre en otra pestaña)
      </a>
    </div>
  );
}
