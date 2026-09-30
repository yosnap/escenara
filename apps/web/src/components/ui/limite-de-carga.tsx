"use client";

import { RefreshCw, RotateCcw } from "lucide-react";
import { Component, type ReactNode } from "react";
import { causaDelFallo, mensajeDePantalla, mensajeDeParte } from "@/lib/fallo-de-carga";
import { Alerta } from "./alerta";
import { Boton } from "./button";

const recargar = () => window.location.reload();
const enLinea = () => (typeof navigator === "undefined" ? true : navigator.onLine);

/** Aviso de una parte que no ha llegado: la causa y «Recargar», con la alerta de siempre. */
export function AvisoParteNoCargada({ error }: { error: unknown }) {
  const mensaje = mensajeDeParte(causaDelFallo(error, enLinea()));
  return (
    <Alerta
      tipo="error"
      titulo={mensaje.titulo}
      accion={
        <Boton tamano="sm" icono={<RefreshCw className="size-4" />} onClick={recargar}>
          Recargar
        </Boton>
      }
    >
      {mensaje.causa}
    </Alerta>
  );
}

interface EstadoLimite {
  error: unknown;
}

/**
 * **Límite de error de lo que se carga en diferido.** Si el trozo de JavaScript no llega (una versión nueva publicada
 * con la pestaña abierta, o sin red), `next/dynamic` lanza al montarse; sin este límite caería la página entera. Con él,
 * solo esa parte enseña el aviso y el botón «Recargar», y el resto de la pantalla sigue.
 */
export class LimiteDeCarga extends Component<{ children: ReactNode }, EstadoLimite> {
  state: EstadoLimite = { error: null };

  static getDerivedStateFromError(error: unknown): EstadoLimite {
    return { error: error ?? new Error("fallo de carga") };
  }

  render() {
    if (this.state.error) return <AvisoParteNoCargada error={this.state.error} />;
    return this.props.children;
  }
}

/**
 * Pantalla de error de un segmento (`error.tsx`): la causa en castellano, «Reintentar» (`retry` de Next: vuelve a pedir
 * y pintar el segmento) y
 * «Recargar». Nunca el mensaje técnico: como mucho la **referencia** que Next pone al error del servidor, que sirve para
 * buscarlo en los registros sin enseñar nada interno.
 */
export function PantallaDeError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const mensaje = mensajeDePantalla(causaDelFallo(error, enLinea()));
  const reintentar = (
    <Boton
      tamano="sm"
      variante={mensaje.accion === "reintentar" ? "primario" : "secundario"}
      icono={<RotateCcw className="size-4" />}
      onClick={retry}
    >
      Reintentar
    </Boton>
  );
  const botonRecargar = (
    <Boton
      tamano="sm"
      variante={mensaje.accion === "recargar" ? "primario" : "secundario"}
      icono={<RefreshCw className="size-4" />}
      onClick={recargar}
    >
      Recargar
    </Boton>
  );
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-5 py-10 md:px-8">
      <h1 className="text-3xl font-bold text-texto">Algo no ha ido bien</h1>
      <Alerta
        tipo="error"
        titulo={mensaje.titulo}
        accion={
          <div className="flex flex-wrap gap-2">
            {mensaje.accion === "recargar" ? botonRecargar : reintentar}
            {mensaje.accion === "recargar" ? reintentar : botonRecargar}
          </div>
        }
      >
        {mensaje.causa}
        {error.digest && (
          <span className="mt-1 block font-mono text-sm text-texto-suave">Referencia: {error.digest}</span>
        )}
      </Alerta>
    </div>
  );
}
