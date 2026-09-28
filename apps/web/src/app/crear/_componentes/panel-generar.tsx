"use client";

import { Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { Boton } from "@/components/ui/button";
import { Casilla } from "@/components/ui/choice";
import { PanelCoste } from "@/components/ui/coste";
import { creditosAConfirmar, type Estimacion, formatearCreditos } from "@/lib/generacion";

export interface ConfirmacionCoste {
  creditosConfirmados: number;
  /** Sello del precio que se mostró: si el precio ha cambiado, el servidor lo rechaza. */
  selloEstimacion: string;
  derechos: boolean;
  /** Casilla «tengo derecho a usar esta marca»: solo se pide cuando el envío lleva producto. */
  derechoMarca: boolean;
  avisoUmbralAceptado: boolean;
  /** Clave de la confirmación: la misma confirmación repetida no genera un segundo trabajo. */
  claveIdempotencia: string;
  /**
   * Avisos «Necesita ajustes» confirmados expresamente (0.18.0). Viajan con el envío y **entran en la firma**
   * de esta confirmación: confirmar un aviso distinto es otra confirmación y estrena clave.
   */
  avisosConfirmados: string[];
}

/**
 * Confirmación explícita antes de gastar: el coste estimado que se muestra es el que se envía al servidor,
 * y sin la casilla de derecho de uso de la imagen el botón no se activa. Si el servidor ve un coste
 * distinto del confirmado, rechaza el envío y hay que volver a revisarlo.
 *
 * Cada confirmación lleva una clave propia: mientras no cambie lo que se confirma (`firma`), reintentar
 * envía la misma clave y el servidor devuelve el trabajo que ya creó en lugar de pedir otro al proveedor.
 */
export function PanelGenerar({
  estimacion,
  etiqueta,
  firma,
  bloqueos,
  avisosConfirmados,
  conProducto = false,
  enviando,
  onGenerar,
}: {
  estimacion: Estimacion;
  etiqueta: string;
  /** Qué se está confirmando (imagen, descripción y coste): al cambiar, la clave se renueva. */
  firma: string;
  /** Motivos por los que aún no se puede generar, en lenguaje llano. */
  bloqueos: string[];
  /** Avisos de los controles previos que el usuario ha confirmado (0.18.0). */
  avisosConfirmados: readonly string[];
  /** `true` cuando el envío lleva producto: entonces, y solo entonces, se pide la casilla de la marca. */
  conProducto?: boolean;
  enviando: boolean;
  onGenerar: (confirmacion: ConfirmacionCoste) => void;
}) {
  const [derechos, setDerechos] = useState(false);
  const [derechoMarca, setDerechoMarca] = useState(false);
  const [avisoAceptado, setAvisoAceptado] = useState(false);
  const clave = useRef<{ firma: string; valor: string } | null>(null);

  const impedimentos = [
    ...bloqueos,
    ...(derechos ? [] : ["Falta confirmar que tienes derecho a usar la imagen."]),
    ...(!conProducto || derechoMarca ? [] : ["Falta confirmar que tienes derecho a usar la marca del producto."]),
    ...(!estimacion.superaUmbral || avisoAceptado ? [] : ["Falta aceptar el aviso de gasto."]),
  ];

  const generar = () => {
    // Misma confirmación, misma clave: un doble clic o un reintento no pagan dos veces. Los avisos confirmados
    // forman parte de la firma (la compone quien llama), así que confirmar otro aviso estrena clave.
    if (clave.current?.firma !== firma) clave.current = { firma, valor: crypto.randomUUID() };
    onGenerar({
      creditosConfirmados: creditosAConfirmar(estimacion),
      selloEstimacion: estimacion.sello,
      derechos,
      derechoMarca,
      avisoUmbralAceptado: avisoAceptado,
      claveIdempotencia: clave.current.valor,
      avisosConfirmados: [...avisosConfirmados],
    });
  };

  return (
    <PanelCoste
      estimacion={estimacion}
      aviso={
        impedimentos.length > 0 ? (
          <ul className="flex list-inside list-disc flex-col gap-1">
            {impedimentos.map((motivo) => (
              <li key={motivo}>{motivo}</li>
            ))}
          </ul>
        ) : undefined
      }
    >
      <Casilla
        etiqueta="Tengo derecho a usar esta imagen"
        descripcion="Es tuya o tienes permiso de quien aparece en ella. Para generar, la imagen se sube temporalmente al almacenamiento de KIE, donde queda accesible por enlace unas horas. Tu confirmación queda registrada en el trabajo."
        marcada={derechos}
        onCambio={setDerechos}
      />
      {conProducto && (
        <Casilla
          etiqueta="Tengo derecho a usar esta marca"
          descripcion="El producto es tuyo o tienes autorización de la marca para usarlo en este vídeo. Solo aparece cuando el envío lleva producto, y sin ella no se genera. Tu declaración queda registrada con su fecha."
          marcada={derechoMarca}
          onCambio={setDerechoMarca}
        />
      )}
      {estimacion.superaUmbral && (
        <Casilla
          etiqueta={`Sé que este trabajo pasa de ${formatearCreditos(estimacion.umbral)}`}
          descripcion="Aviso de gasto alto: hay que aceptarlo expresamente antes de enviarlo."
          marcada={avisoAceptado}
          onCambio={setAvisoAceptado}
        />
      )}
      <Boton
        variante="chispa"
        icono={<Sparkles className="size-5" />}
        className="self-start"
        cargando={enviando}
        disabled={impedimentos.length > 0}
        onClick={generar}
      >
        {etiqueta}
      </Boton>
    </PanelCoste>
  );
}
