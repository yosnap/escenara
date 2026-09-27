"use client";

import { Coins } from "lucide-react";
import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { Aviso } from "@/components/ui/feedback";
import { Campo, EntradaTexto } from "@/components/ui/field";
import { formatearCreditos, type TrabajoVista } from "@/lib/generacion";
import { autorizarLimite } from "./api-generacion";

/**
 * Un trabajo cuyo coste no se puede acotar no se envía: pide un techo de gasto (PRD §6). Lo que el usuario
 * escribe aquí es exactamente lo que se reserva de su presupuesto, así que el gasto queda acotado por su
 * propia decisión y no por una suposición nuestra.
 */
export function LimiteDeGasto({
  trabajo,
  onAutorizado,
}: {
  trabajo: TrabajoVista;
  onAutorizado: (trabajo: TrabajoVista) => void;
}) {
  const [creditos, setCreditos] = useState(String(trabajo.creditosEstimados || ""));
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const numero = Number(creditos);
  const valido = Number.isInteger(numero) && numero > 0;

  const autorizar = async () => {
    setEnviando(true);
    setError(null);
    const respuesta = await autorizarLimite(trabajo.id, numero);
    setEnviando(false);
    if (!respuesta.ok) {
      setError(respuesta.error);
      return;
    }
    onAutorizado(respuesta.datos);
  };

  return (
    <div className="flex flex-col gap-3 rounded-control bg-elevada p-4">
      <p className="text-sm text-texto">
        Indica cuántos créditos autorizas para este trabajo. Se reservarán{" "}
        {valido ? formatearCreditos(numero) : "los que indiques"} de tu presupuesto. El precio final lo decide el
        proveedor: si cobrara más, se registra el gasto real y te avisamos aquí mismo.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <Campo etiqueta="Créditos que autorizo" ayuda="Número entero mayor que cero.">
          {(p) => (
            <EntradaTexto
              {...p}
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={creditos}
              onChange={(e) => setCreditos(e.target.value)}
              className="max-w-40"
            />
          )}
        </Campo>
        <Boton icono={<Coins className="size-4" />} cargando={enviando} disabled={!valido} onClick={autorizar}>
          Autorizar y encolar
        </Boton>
      </div>
      {error && <Aviso tono="error">{error}</Aviso>}
    </div>
  );
}
