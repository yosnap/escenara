"use client";

import { Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { Boton } from "@/components/ui/button";
import { Casilla } from "@/components/ui/choice";
import { PanelCoste } from "@/components/ui/coste";
import { creditosAConfirmar, type Estimacion, formatearCreditos } from "@/lib/generacion";
import { errorDeRequisito, idRequisito, type Requisito, requisitosDeConfirmacion } from "@/lib/requisitos";
import { type EstadoConfirmacion, useConfirmacionCoste } from "./use-confirmacion-coste";

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
  envio,
  paso,
  confirmacion,
  marcar = false,
  avisoEnBloque = false,
  enviando,
  onIntento,
  onGenerar,
}: {
  estimacion: Estimacion;
  etiqueta: string;
  /** Qué se está confirmando (imagen, descripción y coste): al cambiar, la clave se renueva. */
  firma: string;
  /** Motivos por los que aún no se puede generar, en lenguaje llano y con el campo al que apuntan. */
  bloqueos: Requisito[];
  /** Avisos de los controles previos que el usuario ha confirmado (0.18.0). */
  avisosConfirmados: readonly string[];
  /** `true` cuando el envío lleva producto: entonces, y solo entonces, se pide la casilla de la marca. */
  conProducto?: boolean;
  /** Envío que se confirma: entra en el identificador de sus casillas, que no pueden repetirse entre envíos. */
  envio: string;
  /** Paso donde está este panel. */
  paso: string;
  /**
   * Las casillas, si las guarda quien pinta el paso para contarlas y señalarlas fuera de este panel. Sin ellas, las
   * guarda el propio panel.
   */
  confirmacion?: EstadoConfirmacion;
  /**
   * `true` cuando la persona ya ha salido del paso, ha ido a un requisito o ha intentado generar: solo entonces se
   * marcan las casillas pendientes (aro, `aria-invalid` y mensaje). Al abrir el paso no hay nada en rojo.
   */
  marcar?: boolean;
  /** `true` si el paso ya enseña arriba el bloque «Antes de generar, falta:»: la lista de aquí no se repite al lector. */
  avisoEnBloque?: boolean;
  enviando: boolean;
  /** Se ha pulsado el botón mientras faltaba algo: recibe el primer requisito para llevar a él. */
  onIntento?: (primero: Requisito) => void;
  onGenerar: (confirmacion: ConfirmacionCoste) => void;
}) {
  const propia = useConfirmacionCoste({ vigente: true, imagen: "", sello: estimacion.sello });
  const { derechos, derechoMarca, avisoAceptado, setDerechos, setDerechoMarca, setAvisoAceptado } =
    confirmacion ?? propia;
  const [intentado, setIntentado] = useState(false);
  const clave = useRef<{ firma: string; valor: string } | null>(null);

  const pendientes = requisitosDeConfirmacion({
    envio,
    paso,
    conProducto,
    superaUmbral: estimacion.superaUmbral,
    derechos,
    derechoMarca,
    avisoAceptado,
  });
  const impedimentos = [...bloqueos, ...pendientes];
  const marcadas = marcar || intentado ? pendientes : [];

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
          <ul aria-hidden={avisoEnBloque || undefined} className="flex list-inside list-disc flex-col gap-1">
            {impedimentos.map((requisito) => (
              <li key={`${requisito.id}|${requisito.texto}`}>{requisito.texto}</li>
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
        requisito={idRequisito(envio, "derechos")}
        error={errorDeRequisito(marcadas, idRequisito(envio, "derechos"))}
      />
      {conProducto && (
        <Casilla
          etiqueta="Tengo derecho a usar esta marca"
          descripcion="El producto es tuyo o tienes autorización de la marca para usarlo en este vídeo. Solo aparece cuando el envío lleva producto, y sin ella no se genera. Tu declaración queda registrada con su fecha."
          marcada={derechoMarca}
          onCambio={setDerechoMarca}
          requisito={idRequisito(envio, "marca")}
          error={errorDeRequisito(marcadas, idRequisito(envio, "marca"))}
        />
      )}
      {estimacion.superaUmbral && (
        <Casilla
          etiqueta={`Sé que este trabajo pasa de ${formatearCreditos(estimacion.umbral)}`}
          descripcion="Aviso de gasto alto: hay que aceptarlo expresamente antes de enviarlo."
          marcada={avisoAceptado}
          onCambio={setAvisoAceptado}
          requisito={idRequisito(envio, "aviso-gasto")}
          error={errorDeRequisito(marcadas, idRequisito(envio, "aviso-gasto"))}
        />
      )}
      <Boton
        variante="chispa"
        icono={<Sparkles className="size-5" />}
        cargando={enviando}
        // Con requisitos pendientes el botón sigue enfocable y, al pulsarlo, señala qué falta en lugar de enviar.
        aria-disabled={impedimentos.length > 0 || undefined}
        className="self-start aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
        onClick={() => {
          const primero = impedimentos[0];
          if (!primero) return generar();
          setIntentado(true);
          onIntento?.(primero);
        }}
      >
        {etiqueta}
      </Boton>
    </PanelCoste>
  );
}
