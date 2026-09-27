"use client";

import { Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { Boton } from "@/components/ui/button";
import { Casilla } from "@/components/ui/choice";
import { formatearCreditos } from "@/lib/generacion";
import type { ConfirmacionEnvio } from "./api-produccion";

/**
 * Confirmación explícita antes de gastar, en **zona de claridad**: el importe que se muestra es el que se envía al
 * servidor, y sin las dos casillas obligatorias el botón no se activa.
 *
 * - derecho de uso de la imagen (RF04);
 * - revisión de las referencias del personaje: en sus fotos no aparece nadie más ni ningún menor (ADR-0009).
 *
 * Cada confirmación lleva **su propia clave**: mientras no cambie lo que se confirma (`firma`), reintentar manda
 * la misma clave y el servidor devuelve el trabajo que ya creó en lugar de encargar otro. De esa clave el servidor
 * deriva una por escena, así que producir un proyecto entero es un solo clic sin riesgo de cobrar dos veces.
 */
export function ConfirmacionGasto({
  titulo,
  explicacion,
  creditos,
  sello,
  etiqueta,
  firma,
  bloqueos,
  avisosConfirmados,
  ocupado,
  onEnviar,
}: {
  titulo: string;
  explicacion: string;
  /** Créditos que se van a confirmar. Es la cifra exacta que compara el servidor. */
  creditos: number;
  /** Sello del precio que se mostró: si ha cambiado, el servidor rechaza el envío. */
  sello: string;
  etiqueta: string;
  /** Qué se está confirmando: al cambiar, la clave se renueva. */
  firma: string;
  /** Motivos por los que aún no se puede generar, en lenguaje llano. */
  bloqueos: readonly string[];
  /** Avisos «Necesita ajustes» que el usuario ha confirmado (0.18.0). */
  avisosConfirmados: readonly string[];
  ocupado: boolean;
  onEnviar: (confirmacion: ConfirmacionEnvio) => void;
}) {
  const [derechos, setDerechos] = useState(false);
  const [sinTerceros, setSinTerceros] = useState(false);
  const clave = useRef<{ firma: string; valor: string } | null>(null);

  const impedimentos = [
    ...bloqueos,
    ...(derechos ? [] : ["Falta confirmar que tienes derecho a usar la imagen."]),
    ...(sinTerceros ? [] : ["Falta confirmar la revisión de las fotos del personaje."]),
  ];

  const enviar = () => {
    if (clave.current?.firma !== firma) clave.current = { firma, valor: crypto.randomUUID() };
    onEnviar({
      derechos,
      sinTerceros,
      creditosConfirmados: creditos,
      selloEstimacion: sello,
      claveIdempotencia: clave.current.valor,
      // El aviso de gasto alto se acepta con la misma acción: la explicación lleva el importe delante.
      avisoUmbralAceptado: true,
      avisosConfirmados: [...avisosConfirmados],
    });
  };

  return (
    <div className="flex flex-col gap-3 rounded-tarjeta border-2 border-borde bg-superficie p-4">
      <div>
        <h3 className="text-lg font-bold text-texto">{titulo}</h3>
        <p className="mt-1 text-sm text-texto-suave">{explicacion}</p>
      </div>
      <p className="font-mono text-lg font-bold text-texto">{formatearCreditos(creditos)} (estimación)</p>
      <Casilla
        etiqueta="Tengo derecho a usar esta imagen"
        descripcion="Es tuya o tienes permiso de quien aparece en ella. Para generar, las fotos se suben temporalmente al almacenamiento del proveedor, donde quedan accesibles por enlace unas horas."
        marcada={derechos}
        onCambio={setDerechos}
      />
      <Casilla
        etiqueta="En las fotos del personaje no aparece nadie más ni ningún menor"
        descripcion="Lo revisas tú antes de enviarlas: nadie puede comprobarlo por ti. Tu confirmación queda registrada con su fecha."
        marcada={sinTerceros}
        onCambio={setSinTerceros}
      />
      {impedimentos.length > 0 && (
        <ul className="flex list-inside list-disc flex-col gap-1 text-sm text-texto">
          {impedimentos.map((motivo) => (
            <li key={motivo}>{motivo}</li>
          ))}
        </ul>
      )}
      <Boton
        variante="chispa"
        icono={<Sparkles className="size-5" />}
        className="self-start"
        cargando={ocupado}
        disabled={impedimentos.length > 0 || creditos <= 0}
        onClick={enviar}
      >
        {etiqueta}
      </Boton>
      <p className="text-sm text-texto-suave">
        El importe final lo decide el proveedor y se paga con tu propia clave. Escenara solo estima con el precio que
        tiene registrado.
      </p>
    </div>
  );
}
