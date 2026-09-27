"use client";

import { Casilla } from "@/components/ui/choice";
import { SelectorMedios } from "@/components/ui/media/selector-medios";
import { SelectorModelo } from "@/components/ui/modelo";
import { Paso } from "@/components/ui/paso";
import { SelectorPersonaje } from "@/components/ui/personaje";
import type { ModeloElegible } from "@/lib/catalogo";
import type { Medio } from "@/lib/media/tipos";
import { AVISO_SIN_TERCEROS, type PersonajeElegible } from "@/lib/personajes";

/**
 * Paso 1 de «Crear»: a quién se genera (personaje o imagen suelta), la revisión obligatoria de las fotos y el
 * modelo del fotograma.
 *
 * Está aparte de `vista-crear.tsx` para que ese fichero siga siendo legible de una vez: aquí no hay estado
 * propio, solo lo que se elige y las acciones que lo cambian.
 */
export function PasoSujeto({
  personajes,
  personajeId,
  personaje,
  imagen,
  referencia,
  modelos,
  modeloElegido,
  modeloFoto,
  sinTerceros,
  deshabilitado,
  onPersonaje,
  onImagen,
  onSinTerceros,
  onModelo,
}: {
  personajes: PersonajeElegible[];
  personajeId: string | null;
  personaje: PersonajeElegible | null;
  imagen: Medio[];
  referencia: Medio | null;
  modelos: ModeloElegible[];
  /** Identificador del modelo elegido para el fotograma. */
  modeloElegido: string;
  /** Ficha del modelo elegido, si está en la lista: de ahí sale el tope de fotos que se anuncia. */
  modeloFoto: ModeloElegible | null;
  sinTerceros: boolean;
  deshabilitado: boolean;
  onPersonaje: (id: string | null) => void;
  onImagen: (medios: Medio[]) => void;
  onSinTerceros: (valor: boolean) => void;
  onModelo: (modelo: string) => void;
}) {
  return (
    <Paso numero={1} titulo="Elige a quién generas">
      <SelectorPersonaje
        personajes={personajes}
        valor={personajeId}
        onCambio={onPersonaje}
        deshabilitado={deshabilitado}
      />
      {personaje ? (
        <p className="text-texto-suave">
          Se enviarán varias fotos de «{personaje.nombre}»
          {modeloFoto && modeloFoto.maximoReferencias > 0
            ? ` (hasta ${modeloFoto.maximoReferencias}, las que admite ${modeloFoto.nombre})`
            : ""}
          : varias referencias dan mucha mejor guía de identidad que una sola.
        </p>
      ) : (
        <SelectorMedios
          etiqueta="Imagen de la persona o el personaje"
          ayuda="Solo imágenes. Puedes subirla, arrastrarla o elegirla de tu biblioteca. Con un personaje se envían varias fotos suyas en lugar de una sola."
          tipos={["imagen"]}
          sinDocumentos
          valor={imagen}
          onCambio={onImagen}
        />
      )}
      {(personaje || referencia) && (
        <div className="rounded-tarjeta border-2 border-borde bg-superficie p-4">
          <Casilla
            etiqueta="En estas fotos no aparece ninguna otra persona ni ningún menor"
            descripcion={AVISO_SIN_TERCEROS}
            marcada={sinTerceros}
            deshabilitado={deshabilitado}
            onCambio={onSinTerceros}
          />
        </div>
      )}
      {modelos.length > 1 && (
        <SelectorModelo
          etiqueta="Modelo del fotograma"
          modelos={modelos}
          valor={modeloElegido}
          onCambio={onModelo}
          deshabilitado={deshabilitado}
        />
      )}
    </Paso>
  );
}
