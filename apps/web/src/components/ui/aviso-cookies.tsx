"use client";

import { useEffect, useState } from "react";

const CLAVE = "escenara-aviso-cookies-v1";
const DURACION = 180 * 24 * 60 * 60_000;

/** Información de almacenamiento técnico, sin fingir un consentimiento para rastreadores inexistentes. */
export function AvisoCookies() {
  const [abierto, setAbierto] = useState(false);
  useEffect(() => {
    try {
      const hasta = Number(localStorage.getItem(CLAVE));
      setAbierto(!Number.isFinite(hasta) || hasta <= Date.now());
    } catch {
      setAbierto(true);
    }
  }, []);
  const cerrar = () => {
    try {
      localStorage.setItem(CLAVE, String(Date.now() + DURACION));
    } catch {
      /* Sin almacenamiento vuelve a mostrarse en la siguiente visita. */
    }
    setAbierto(false);
  };
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="min-h-11 px-2 text-sm font-semibold text-acento underline-offset-4 hover:underline"
      >
        Configurar cookies
      </button>
      {abierto && (
        <aside
          aria-label="Cookies y almacenamiento local"
          className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl rounded-tarjeta border-2 border-borde bg-superficie p-4 text-texto shadow-lg"
        >
          <h2 className="font-bold">Cookies y almacenamiento local</h2>
          <p className="mt-2 text-sm">
            Usamos cookies técnicas para iniciar sesión y proteger el acceso. Guardamos el tema que eliges y este aviso
            en tu navegador. No usamos cookies de analítica ni publicidad.
          </p>
          <details className="mt-2 text-sm">
            <summary className="min-h-11 cursor-pointer py-3 font-semibold">Ver configuración</summary>
            <p>
              Las cookies de acceso son necesarias para usar tu cuenta. Puedes borrarlas en el navegador, pero cerrarás
              la sesión. No hay categorías opcionales que activar.
            </p>
          </details>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <a href="/legal/cookies" className="inline-flex min-h-11 items-center font-semibold text-acento underline">
              Política de cookies
            </a>
            <button
              type="button"
              onClick={cerrar}
              className="min-h-11 rounded-control bg-acento px-4 font-semibold text-sobre-acento"
            >
              Entendido
            </button>
          </div>
        </aside>
      )}
    </>
  );
}
