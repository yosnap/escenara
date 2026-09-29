"use client";

import {
  DESCRIPCION_DERECHOS_CANTO,
  exigeReferenciaDeLicencia,
  NOMBRE_DERECHOS_CANTO,
  TEXTO_DECLARACION_CANTO,
  TIPOS_DERECHOS_CANTO,
  type TipoDerechosCanto,
} from "@/lib/canto";
import { Casilla, GrupoOpciones } from "../choice";
import { Aviso } from "../feedback";
import { Campo, EntradaTexto } from "../field";

/** Selección y texto completo que el servidor guarda al declarar los derechos de un audio. */
export function DeclaracionDerechosCanto({
  tipo,
  referencia,
  aceptada,
  onTipo,
  onReferencia,
  onAceptada,
}: {
  tipo: TipoDerechosCanto;
  referencia: string;
  aceptada: boolean;
  onTipo: (tipo: TipoDerechosCanto) => void;
  onReferencia: (referencia: string) => void;
  onAceptada: (aceptada: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-tarjeta border border-borde bg-superficie p-4">
      <GrupoOpciones
        etiqueta="¿Con qué derecho usas este audio?"
        opciones={TIPOS_DERECHOS_CANTO.map((valor) => ({
          value: valor,
          etiqueta: NOMBRE_DERECHOS_CANTO[valor],
          descripcion: DESCRIPCION_DERECHOS_CANTO[valor],
        }))}
        valor={tipo}
        onCambio={(valor) => onTipo(valor as TipoDerechosCanto)}
      />
      {exigeReferenciaDeLicencia(tipo) && (
        <Campo etiqueta="Referencia de la licencia" ayuda="Sello, número de licencia o lugar donde la adquiriste.">
          {(props) => (
            <EntradaTexto
              {...props}
              value={referencia}
              maxLength={300}
              onChange={(e) => onReferencia(e.target.value)}
            />
          )}
        </Campo>
      )}
      <Aviso tono="info">{TEXTO_DECLARACION_CANTO[tipo]}</Aviso>
      <Casilla
        etiqueta="Confirmo esta declaración para el audio seleccionado"
        descripcion="Guardaremos el texto aceptado y la fecha. Escenara no comprueba automáticamente los derechos."
        marcada={aceptada}
        onCambio={onAceptada}
      />
    </div>
  );
}
