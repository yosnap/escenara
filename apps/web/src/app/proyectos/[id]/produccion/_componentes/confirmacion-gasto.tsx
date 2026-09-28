"use client";

import { Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { Boton } from "@/components/ui/button";
import { Casilla } from "@/components/ui/choice";
import { formatearCreditos } from "@/lib/generacion";
import { exigeAvisoDeGasto } from "@/lib/produccion";
import type { ConfirmacionEnvio } from "./api-produccion";

/**
 * Confirmación explícita antes de gastar, en **zona de claridad**: el importe que se muestra es el que se envía al
 * servidor, y sin las dos casillas obligatorias el botón no se activa.
 *
 * - derecho de uso de la imagen (RF04);
 * - revisión de las referencias del personaje: en sus fotos no aparece nadie más ni ningún menor (ADR-0009);
 * - y, cuando el importe por trabajo pasa del umbral de Admin › Ajustes, el aviso de gasto alto, que se acepta aquí
 *   y no se da por aceptado en nombre de nadie.
 *
 * Cada confirmación lleva **su propia clave**: mientras no cambie lo que se confirma (`firma`), reintentar manda
 * la misma clave y el servidor devuelve el trabajo que ya creó en lugar de encargar otro. De esa clave el servidor
 * deriva una por escena, así que producir un proyecto entero es un solo clic sin riesgo de cobrar dos veces.
 */
export function ConfirmacionGasto({
  titulo,
  explicacion,
  creditos,
  total,
  umbral,
  sello,
  etiqueta,
  firma,
  bloqueos,
  avisosConfirmados,
  avisos = [],
  conProducto = false,
  onConfirmarAviso,
  ocupado,
  onEnviar,
}: {
  titulo: string;
  explicacion: string;
  /** Créditos que se van a confirmar **por trabajo**. Es la cifra exacta que compara el servidor. */
  creditos: number;
  /**
   * Importe total de la acción cuando encola varios trabajos de golpe: es la cifra **principal**, porque es lo que
   * se compromete al pulsar, y `creditos` pasa a ser el detalle. Sin esto, el botón de lote enseñaría el importe de
   * un solo trabajo.
   */
  total?: { creditos: number; detalle: string };
  /** Umbral del aviso por gasto alto de Admin › Ajustes, en créditos y por trabajo. */
  umbral: number;
  /** Sello del precio que se mostró: si ha cambiado, el servidor rechaza el envío. */
  sello: string;
  etiqueta: string;
  /** Qué se está confirmando: al cambiar, la clave se renueva. */
  firma: string;
  /** Motivos por los que aún no se puede generar, en lenguaje llano. */
  bloqueos: readonly string[];
  /** Avisos «Necesita ajustes» que el usuario ha confirmado (0.18.0). */
  avisosConfirmados: readonly string[];
  /**
   * Avisos salvables que afectan a esta acción. Cada uno lleva su casilla **aquí mismo**, junto al botón que
   * frenan: la confirmación es la misma que la del panel «Antes de generar» de arriba, así que marcar una marca
   * las dos. Sin esto, el botón decía «falta confirmar el aviso» sin decir dónde.
   */
  avisos?: readonly { regla: string; motivo: string }[];
  /** `true` cuando la escena lleva producto: entonces, y solo entonces, se pide la casilla de la marca. */
  conProducto?: boolean;
  onConfirmarAviso?: (regla: string, valor: boolean) => void;
  ocupado: boolean;
  onEnviar: (confirmacion: ConfirmacionEnvio) => void;
}) {
  const [derechos, setDerechos] = useState(false);
  const [sinTerceros, setSinTerceros] = useState(false);
  const [derechoMarca, setDerechoMarca] = useState(false);
  const [avisoAceptado, setAvisoAceptado] = useState(false);
  const clave = useRef<{ firma: string; valor: string } | null>(null);

  // El aviso se mide sobre lo que se confirma **por trabajo**, con la función que comparte la comparación con el
  // servidor: así el botón no puede quedarse esperando una casilla que no aparece.
  const superaUmbral = exigeAvisoDeGasto(creditos, umbral);
  const impedimentos = [
    ...bloqueos,
    ...(derechos ? [] : ["Falta confirmar que tienes derecho a usar la imagen."]),
    ...(sinTerceros ? [] : ["Falta confirmar la revisión de las fotos del personaje."]),
    ...(!conProducto || derechoMarca ? [] : ["Falta confirmar que tienes derecho a usar la marca del producto."]),
    ...(!superaUmbral || avisoAceptado ? [] : ["Falta aceptar el aviso de gasto alto."]),
  ];

  const enviar = () => {
    if (clave.current?.firma !== firma) clave.current = { firma, valor: crypto.randomUUID() };
    onEnviar({
      derechos,
      derechoMarca,
      sinTerceros,
      creditosConfirmados: creditos,
      selloEstimacion: sello,
      claveIdempotencia: clave.current.valor,
      // El aviso de gasto alto se acepta en su propia casilla: mandarlo aceptado siempre anularía el umbral que
      // configura quien administra la instalación.
      avisoUmbralAceptado: avisoAceptado,
      avisosConfirmados: [...avisosConfirmados],
    });
  };

  return (
    <div className="flex flex-col gap-3 rounded-tarjeta border-2 border-borde bg-superficie p-4">
      <div>
        <h3 className="text-lg font-bold text-texto">{titulo}</h3>
        <p className="mt-1 text-sm text-texto-suave">{explicacion}</p>
      </div>
      <div>
        <p className="font-mono text-lg font-bold text-texto">
          {formatearCreditos(total ? total.creditos : creditos)} (estimación)
        </p>
        {total && <p className="mt-0.5 text-sm text-texto-suave">{total.detalle}</p>}
      </div>
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
      {conProducto && (
        <Casilla
          etiqueta="Tengo derecho a usar esta marca"
          descripcion="El producto es tuyo o tienes autorización de la marca para usarlo en este vídeo. Solo aparece cuando el envío lleva producto, y sin ella no se genera. Tu declaración queda registrada con su fecha."
          marcada={derechoMarca}
          onCambio={setDerechoMarca}
        />
      )}
      {onConfirmarAviso &&
        avisos.map((aviso) => (
          <Casilla
            key={aviso.regla}
            etiqueta="Lo he leído y quiero generar igualmente"
            descripcion={aviso.motivo}
            marcada={avisosConfirmados.includes(aviso.regla)}
            onCambio={(valor) => onConfirmarAviso(aviso.regla, valor)}
          />
        ))}
      {superaUmbral && (
        <Casilla
          etiqueta={`Sé que cada trabajo de esta acción pasa de ${formatearCreditos(umbral)}`}
          descripcion="Aviso de gasto alto de esta instalación: hay que aceptarlo expresamente antes de enviarlo."
          marcada={avisoAceptado}
          onCambio={setAvisoAceptado}
        />
      )}
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
