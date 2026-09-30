"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";
import { Alerta } from "@/components/ui/alerta";
import { Boton } from "@/components/ui/button";

/**
 * «Cerrar sesión». El cliente de autenticación se descarga al pulsar, no con cada página: el botón está en la
 * cabecera de toda la aplicación y el cliente pesa lo suyo. Si no llega (sin conexión), se dice y se puede reintentar;
 * nunca se lleva a «Has cerrado la sesión» sin haberla cerrado.
 */
export function CerrarSesion() {
  const [saliendo, setSaliendo] = useState(false);
  const [error, setError] = useState(false);
  return (
    <div className="flex items-center gap-2">
      {error && (
        <Alerta tipo="error" compacta>
          Sin conexión: la sesión sigue abierta. Vuelve a pulsar cuando tengas red.
        </Alerta>
      )}
      <Boton
        variante="fantasma"
        tamano="sm"
        icono={<LogOut className="size-4" />}
        cargando={saliendo}
        onClick={async () => {
          setSaliendo(true);
          setError(false);
          try {
            const { authCliente } = await import("@/lib/auth-cliente");
            await authCliente.signOut();
            window.location.assign("/entrar?aviso=cerrada");
          } catch {
            setSaliendo(false);
            setError(true);
          }
        }}
      >
        Cerrar sesión
      </Boton>
    </div>
  );
}
