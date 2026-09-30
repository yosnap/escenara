"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alerta } from "@/components/ui/alerta";
import { Boton } from "@/components/ui/button";

/**
 * Reconstruye el conjunto etiquetado y vuelve a calibrar. No gasta nada ni llama a ningún proveedor: lee las revisiones
 * que ya están registradas. El error, si lo hay, se enseña con su causa.
 */
export function Recalibrar() {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recalibrar = async () => {
    setOcupado(true);
    setError(null);
    try {
      const respuesta = await fetch("/api/admin/calibracion", { method: "POST" });
      if (!respuesta.ok) {
        const cuerpo = (await respuesta.json().catch(() => null)) as { error?: string } | null;
        setError(cuerpo?.error ?? `El servidor ha respondido ${respuesta.status} y no se ha recalculado nada.`);
        return;
      }
      router.refresh();
    } catch {
      setError("Sin conexión con el servidor: no se ha recalculado nada. Vuelve a intentarlo.");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Boton icono={<RefreshCw className="size-4" />} cargando={ocupado} onClick={recalibrar} className="self-start">
        Reconstruir el conjunto y calibrar
      </Boton>
      {error && (
        <Alerta tipo="error" anuncio="alerta" compacta titulo="No se ha podido calibrar">
          {error}
        </Alerta>
      )}
    </div>
  );
}
