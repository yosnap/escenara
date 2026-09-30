"use client";

import { Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alerta } from "../alerta";
import { Boton } from "../button";
import { usarPublicacion } from "./api-comunidad";

/** «Usar» un trend o una plantilla compartidos: abre «Crear» con esa plantilla y la atribución. No gasta nada. */
export function BotonUsar({ id, tipo }: { id: string; tipo: "trend" | "plantilla" }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const usar = async () => {
    setOcupado(true);
    setError(null);
    const r = await usarPublicacion(id);
    setOcupado(false);
    if (!r.ok) return setError(r.error);
    router.push(r.datos.destino);
  };
  return (
    <div className="flex flex-col gap-2">
      <Boton
        variante="cobalto"
        tamano="sm"
        icono={<Wand2 className="size-4" />}
        cargando={ocupado}
        onClick={() => void usar()}
        className="self-start"
      >
        Usar este {tipo} en Crear
      </Boton>
      {error && (
        <Alerta tipo="error" compacta>
          {error}
        </Alerta>
      )}
    </div>
  );
}
