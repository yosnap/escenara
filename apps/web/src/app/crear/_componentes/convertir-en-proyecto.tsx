"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { TarjetaConvertirEnProyecto } from "@/components/ui/conversion";
import type { EstadoConversion, ProyectoConvertido } from "@/lib/conversion";

/**
 * «Convertir en proyecto» en el resultado de un clip de «Crear» (0.35.0). Pregunta al servidor si el clip se puede
 * convertir —el consentimiento del personaje o un clip ya convertido solo los sabe él— y, al pulsar, crea el
 * proyecto y lleva a su paso de escenas. **No cobra nada**: el clip se reutiliza tal cual.
 */
export function ConvertirEnProyecto({ trabajoId }: { trabajoId: string }) {
  const router = useRouter();
  const [estado, setEstado] = useState<EstadoConversion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [convirtiendo, setConvirtiendo] = useState(false);

  useEffect(() => {
    let vigente = true;
    fetch(`/api/generacion/trabajos/${trabajoId}/proyecto`)
      .then(async (respuesta) => {
        const cuerpo = await respuesta.json().catch(() => null);
        if (!vigente) return;
        if (respuesta.ok) setEstado(cuerpo as EstadoConversion);
        else setEstado({ estado: "no_convertible", motivo: cuerpo?.error ?? "No se ha podido comprobar este clip." });
      })
      .catch(() => {
        if (vigente) {
          setEstado({
            estado: "no_convertible",
            motivo:
              "Sin conexión con el servidor: no se ha podido comprobar si este clip se puede convertir. Recarga la página.",
          });
        }
      });
    return () => {
      vigente = false;
    };
  }, [trabajoId]);

  const convertir = async () => {
    setConvirtiendo(true);
    setError(null);
    try {
      const respuesta = await fetch(`/api/generacion/trabajos/${trabajoId}/proyecto`, { method: "POST" });
      const cuerpo = await respuesta.json().catch(() => null);
      if (!respuesta.ok) {
        setError(`${cuerpo?.error ?? "No se ha podido crear el proyecto."} No se ha cobrado nada.`);
        return;
      }
      router.push((cuerpo as ProyectoConvertido).url);
    } catch {
      setError(
        "Sin conexión con el servidor. Puede que el proyecto se haya creado: vuelve a pulsar y, si ya existe, te llevará a él. No se cobra nada.",
      );
    } finally {
      setConvirtiendo(false);
    }
  };

  return (
    <TarjetaConvertirEnProyecto
      estado={estado}
      convirtiendo={convirtiendo}
      error={error}
      onConvertir={() => void convertir()}
    />
  );
}
