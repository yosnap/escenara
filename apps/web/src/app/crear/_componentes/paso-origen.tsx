"use client";

import { ImageUp, Sparkles } from "lucide-react";
import { ElectorVisual } from "@/components/ui/direccion/elector-visual";
import { Aviso } from "@/components/ui/feedback";
import { SelectorMedios } from "@/components/ui/media/selector-medios";
import { Paso } from "@/components/ui/paso";
import type { Medio } from "@/lib/media/tipos";

/**
 * **De dónde sale el clip** (0.25.1). Es lo primero que se elige en «Crear», y son dos caminos distintos:
 *
 * - **generar un fotograma nuevo**: eliges a quién sale y qué está haciendo, se compone su imagen y se paga;
 * - **usar una imagen que ya tienes**: un fotograma de otro día, una vista de tu personaje o una foto tuya. No
 *   hay fotograma que generar ni que pagar, así que **todo ese paso desaparece**: se pasa directamente a dirigir
 *   y generar el clip.
 *
 * Están separados a propósito. Antes de la 0.25.1 el único camino era generar un fotograma, así que quien ya
 * tenía la imagen pagaba otra igual para poder animarla.
 */
export const ORIGENES = ["fotograma", "imagen"] as const;
export type OrigenDelClip = (typeof ORIGENES)[number];

export function PasoOrigen({
  numero,
  origen,
  deshabilitado,
  onOrigen,
}: {
  numero: number;
  origen: OrigenDelClip;
  /** `true` con algo ya generado o en marcha: cambiar de camino a mitad despistaría. */
  deshabilitado?: boolean;
  onOrigen: (origen: OrigenDelClip) => void;
}) {
  return (
    <Paso numero={numero} titulo="¿De dónde sale el clip?">
      <ElectorVisual
        etiqueta="Elige por dónde empiezas"
        valor={origen}
        deshabilitado={deshabilitado}
        onCambio={(v) => onOrigen(v as OrigenDelClip)}
        opciones={[
          {
            valor: "fotograma",
            nombre: "Crear un fotograma nuevo",
            frase: "Eliges a quién sale y qué está haciendo, y se genera su imagen.",
            descripcion: "Se paga el fotograma y, después, el clip.",
            pictograma: <Sparkles className="size-8 text-acento" aria-hidden />,
          },
          {
            valor: "imagen",
            nombre: "Usar una imagen que ya tengo",
            frase: "Un fotograma de otro día, una vista de tu personaje o una foto tuya.",
            descripcion: "No se genera ni se paga ningún fotograma: solo el clip.",
            pictograma: <ImageUp className="size-8 text-acento" aria-hidden />,
          },
        ]}
      />
    </Paso>
  );
}

/** El paso que sustituye a todo el fotograma cuando el usuario trae su propia imagen. */
export function PasoImagenDePartida({
  numero,
  imagen,
  onImagen,
}: {
  numero: number;
  imagen: Medio[];
  onImagen: (medios: Medio[]) => void;
}) {
  return (
    <Paso numero={numero} titulo="Elige la imagen de partida">
      <SelectorMedios
        etiqueta="Tu imagen"
        ayuda="Solo imágenes, y tienen que ser tuyas. Será el primer fotograma del clip, tal cual: no se genera nada a partir de ella."
        tipos={["imagen"]}
        sinDocumentos
        valor={imagen}
        onCambio={onImagen}
      />
      {imagen.length > 0 && (
        <Aviso tono="info">
          No hay fotograma que generar ni que pagar: lo único que se confirma y se cobra es el clip. Si esta imagen
          salió de un trabajo hecho con un personaje tuyo, el clip hereda ese personaje y sus reglas.
        </Aviso>
      )}
    </Paso>
  );
}
