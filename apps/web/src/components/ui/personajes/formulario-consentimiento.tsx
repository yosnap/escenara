"use client";

import { FileSignature } from "lucide-react";
import { Casilla, GrupoOpciones } from "@/components/ui/choice";
import { Aviso } from "@/components/ui/feedback";
import { SelectorMedios } from "@/components/ui/media/selector-medios";
import type { Medio } from "@/lib/media/tipos";
import {
  ALCANCES_USO,
  type AlcanceUso,
  AVISO_COHERENCIA,
  AVISO_CONTROL_NO_GARANTIA,
  AVISO_DATOS_AL_PROVEEDOR,
  AVISO_MAYORIA_DE_EDAD,
  DESCRIPCION_ALCANCE,
  DESCRIPCION_TITULAR,
  ETIQUETA_ALCANCE,
  ETIQUETA_AUTORIZO_PARECIDO,
  ETIQUETA_TITULAR,
  exigeDocumento,
  TITULARES_REGISTRABLES,
  type TitularConsentimiento,
} from "@/lib/personajes";

/**
 * Consentimiento de uso de imagen (RF10), en **zona de claridad**: superficies neutras, sin degradados ni
 * parallax, texto legal sin ambigüedad y el alcance real del control escrito delante.
 *
 * Lo que decide de verdad está en el servidor (`server/personajes/consentimiento.ts`): sin declaración de
 * mayoría de edad no se registra nada, y un tercero exige documento firmado y revisión humana.
 */

export interface EstadoConsentimiento {
  titular: TitularConsentimiento;
  mayoriaDeEdad: boolean;
  /**
   * Autorización para la comprobación de identidad (0.24.0). **Opcional**: sin ella el personaje funciona
   * exactamente igual que hasta la 0.23.x, solo que sus vistas generadas no cuentan para la cobertura.
   */
  coherencia: boolean;
  alcance: AlcanceUso;
  /** Documento firmado elegido o subido; solo se usa con el titular «otra persona». */
  documento: Medio[];
}

export const CONSENTIMIENTO_INICIAL: EstadoConsentimiento = {
  titular: "yo",
  mayoriaDeEdad: false,
  coherencia: false,
  alcance: "personal",
  documento: [],
};

/** Motivos por los que el consentimiento aún no se puede registrar. Vacío = se puede. */
export function bloqueosDeConsentimiento(estado: EstadoConsentimiento): string[] {
  const motivos: string[] = [];
  if (!estado.mayoriaDeEdad) motivos.push("Falta declarar que la persona de las fotos es mayor de edad.");
  if (exigeDocumento(estado.titular) && estado.documento.length === 0) {
    motivos.push("Falta subir el documento de consentimiento firmado por esa persona.");
  }
  return motivos;
}

export function FormularioConsentimiento({
  valor,
  onCambio,
  deshabilitado,
}: {
  valor: EstadoConsentimiento;
  onCambio: (estado: EstadoConsentimiento) => void;
  deshabilitado?: boolean;
}) {
  const cambiar = <K extends keyof EstadoConsentimiento>(clave: K, nuevo: EstadoConsentimiento[K]) =>
    onCambio({ ...valor, [clave]: nuevo });

  return (
    <div className="flex flex-col gap-5 rounded-tarjeta border-2 border-borde bg-superficie p-5">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-elevada text-texto [&>svg]:size-5"
        >
          <FileSignature />
        </span>
        <div className="flex flex-col gap-1">
          <h3 className="text-xl font-bold text-texto">Consentimiento de uso de imagen</h3>
          <p className="text-texto-suave">{AVISO_CONTROL_NO_GARANTIA}</p>
          {/* Qué sale de aquí hacia el proveedor: no son solo las fotos, también el texto de la ficha. */}
          <p className="text-texto-suave">{AVISO_DATOS_AL_PROVEEDOR}</p>
        </div>
      </div>

      <GrupoOpciones
        etiqueta="¿De quién es la imagen?"
        opciones={TITULARES_REGISTRABLES.map((t) => ({
          value: t,
          etiqueta: ETIQUETA_TITULAR[t],
          descripcion: DESCRIPCION_TITULAR[t],
        }))}
        valor={valor.titular}
        onCambio={(v) => cambiar("titular", v as TitularConsentimiento)}
      />

      <GrupoOpciones
        etiqueta="¿Para qué se autoriza el uso?"
        opciones={ALCANCES_USO.map((a) => ({
          value: a,
          etiqueta: ETIQUETA_ALCANCE[a],
          descripcion: DESCRIPCION_ALCANCE[a],
        }))}
        valor={valor.alcance}
        onCambio={(v) => cambiar("alcance", v as AlcanceUso)}
      />

      <Casilla
        etiqueta={`${ETIQUETA_AUTORIZO_PARECIDO} (opcional)`}
        descripcion={AVISO_COHERENCIA}
        marcada={valor.coherencia}
        deshabilitado={deshabilitado}
        onCambio={(v) => cambiar("coherencia", v)}
      />

      <Casilla
        etiqueta="Declaro que es mayor de edad"
        descripcion={AVISO_MAYORIA_DE_EDAD}
        marcada={valor.mayoriaDeEdad}
        deshabilitado={deshabilitado}
        onCambio={(v) => cambiar("mayoriaDeEdad", v)}
      />

      {exigeDocumento(valor.titular) && (
        <div className="flex flex-col gap-3">
          <SelectorMedios
            etiqueta="Documento de consentimiento firmado"
            ayuda="Súbelo desde tu equipo como JPEG o PNG: una foto o un escaneo de la hoja firmada. Se guarda tal cual, sin recortar ni recomprimir, para que siga siendo legible, y se le quitan los datos EXIF (incluida la localización). Solo lo ves tú y quien administra esta instalación, para poder revisarlo."
            tipos={["imagen"]}
            documento
            soloSubida
            valor={valor.documento}
            onCambio={(medios) => cambiar("documento", medios)}
          />
          <Aviso tono="info">
            Mientras quien administra esta instalación no acepte el documento, el personaje queda en revisión y no se
            puede usar para generar.
          </Aviso>
        </div>
      )}
    </div>
  );
}
