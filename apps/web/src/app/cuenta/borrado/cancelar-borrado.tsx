"use client";

import { Undo2 } from "lucide-react";
import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { cancelarBorradoCuenta } from "@/components/ui/datos/api-datos";
import { Aviso } from "@/components/ui/feedback";

/** Cancela el borrado programado y vuelve a la cuenta, ya activa. */
export function CancelarBorrado() {
  const [cancelando, setCancelando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <div>
        <Boton
          variante="chispa"
          icono={<Undo2 className="size-4" />}
          cargando={cancelando}
          onClick={async () => {
            setCancelando(true);
            setError(null);
            const r = await cancelarBorradoCuenta();
            if (r.ok) {
              window.location.assign("/cuenta");
              return;
            }
            setCancelando(false);
            setError(r.error);
          }}
        >
          Cancelar el borrado y seguir usando mi cuenta
        </Boton>
      </div>
      {error && <Aviso tono="error">{error}</Aviso>}
    </div>
  );
}
