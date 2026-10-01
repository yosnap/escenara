"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";
import { Alerta } from "@/components/ui/alerta";
import { Boton } from "@/components/ui/button";
import { type CausaFallo, causaDelFallo, mensajeAlCerrarSesion } from "@/lib/fallo-de-carga";

/**
 * «Cerrar sesión». El cliente de autenticación se descarga al pulsar, no con cada página: el botón está en la
 * cabecera de toda la aplicación y el cliente pesa lo suyo. Solo se lleva a «Has cerrado la sesión» si el servidor la ha
 * cerrado; si no, se dice por qué sigue abierta: sin conexión (se reintenta), versión nueva publicada (hay que recargar,
 * porque el trozo ya no existe) o el servidor lo ha rechazado.
 */
export function CerrarSesion() {
  const [saliendo, setSaliendo] = useState(false);
  const [error, setError] = useState<CausaFallo | "rechazo" | null>(null);
  return (
    <div className="flex max-w-full flex-wrap items-center gap-2">
      {error && (
        <Alerta tipo="error" compacta>
          {mensajeAlCerrarSesion(error)}
        </Alerta>
      )}
      <Boton
        variante="fantasma"
        tamano="sm"
        icono={<LogOut className="size-4" aria-hidden />}
        aria-label={saliendo ? "Cerrando sesión" : "Cerrar sesión"}
        title="Cerrar sesión"
        className="size-11 shrink-0 p-0"
        cargando={saliendo}
        onClick={async () => {
          setSaliendo(true);
          setError(null);
          try {
            const { authCliente } = await import("@/lib/auth-cliente");
            // El cliente no lanza cuando el servidor contesta con error: lo devuelve en `error`.
            const { error: rechazo } = await authCliente.signOut();
            if (rechazo) {
              setSaliendo(false);
              setError("rechazo");
              return;
            }
            window.location.assign("/entrar?aviso=cerrada");
          } catch (fallo) {
            setSaliendo(false);
            setError(causaDelFallo(fallo, navigator.onLine));
          }
        }}
      />
    </div>
  );
}
