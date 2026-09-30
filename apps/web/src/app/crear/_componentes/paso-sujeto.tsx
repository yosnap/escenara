"use client";

import { Casilla } from "@/components/ui/choice";
import { SelectorMedios } from "@/components/ui/media/selector-medios";
import { SelectorModelo } from "@/components/ui/modelo";
import { Paso } from "@/components/ui/paso";
import { SelectorPersonaje } from "@/components/ui/personaje";
import { MarcaRequisito } from "@/components/ui/requisitos";
import type { ModeloElegible } from "@/lib/catalogo";
import type { Medio } from "@/lib/media/tipos";
import { AVISO_SIN_TERCEROS, type PersonajeElegible } from "@/lib/personajes";
import { errorDeRequisito, type Requisito } from "@/lib/requisitos";
import { ID_MODELO_FOTOGRAMA, ID_REVISION_FOTOGRAMA, ID_SUJETO } from "@/lib/requisitos-crear";

/**
 * Paso 1 de «Crear»: a quién se genera (personaje o imagen suelta), la revisión obligatoria de las fotos y el
 * modelo del fotograma.
 *
 * Está aparte de `vista-crear.tsx` para que ese fichero siga siendo legible de una vez: aquí no hay estado
 * propio, solo lo que se elige y las acciones que lo cambian.
 */
export function PasoSujeto({
  numero,
  personajes,
  personajeId,
  personaje,
  imagen,
  referencia,
  modelos,
  sinImagen,
  modeloElegido,
  modeloFoto,
  sinTerceros,
  requisitos,
  deshabilitado,
  onPersonaje,
  onImagen,
  onSinTerceros,
  onModelo,
}: {
  /** Su sitio en la lista de pasos: cambia según el camino que haya elegido el usuario. */
  numero: number;
  personajes: PersonajeElegible[];
  personajeId: string | null;
  personaje: PersonajeElegible | null;
  imagen: Medio[];
  referencia: Medio | null;
  modelos: ModeloElegible[];
  /**
   * `true` cuando no hay personaje ni imagen elegidos: la escena saldrá **solo de la descripción**, con un
   * modelo de texto a imagen. Se dice en pantalla, porque es otro modelo y otro precio.
   */
  sinImagen: boolean;
  /** Identificador del modelo elegido para el fotograma. */
  modeloElegido: string;
  /** Ficha del modelo elegido, si está en la lista: de ahí sale el tope de fotos que se anuncia. */
  modeloFoto: ModeloElegible | null;
  sinTerceros: boolean;
  /** Lo que falta para generar el fotograma: aquí se marcan los que apuntan a este paso. */
  requisitos: readonly Requisito[];
  deshabilitado: boolean;
  onPersonaje: (id: string | null) => void;
  onImagen: (medios: Medio[]) => void;
  onSinTerceros: (valor: boolean) => void;
  onModelo: (modelo: string) => void;
}) {
  return (
    <Paso numero={numero} titulo="Elige a quién generas">
      <MarcaRequisito id={ID_SUJETO} error={errorDeRequisito(requisitos, ID_SUJETO)}>
        <SelectorPersonaje
          personajes={personajes}
          valor={personajeId}
          onCambio={onPersonaje}
          deshabilitado={deshabilitado}
        />
      </MarcaRequisito>
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
            requisito={ID_REVISION_FOTOGRAMA}
            error={errorDeRequisito(requisitos, ID_REVISION_FOTOGRAMA)}
          />
        </div>
      )}
      {sinImagen && (
        <p className="rounded-control bg-elevada p-3 text-sm font-medium text-texto">
          Sin personaje ni imagen, la escena se genera{" "}
          <strong className="font-semibold">solo con tu descripción</strong>, con un modelo de texto a imagen. Elige un
          personaje o una foto si quieres partir de una cara concreta.
        </p>
      )}
      {modelos.length > 1 && (
        <MarcaRequisito id={ID_MODELO_FOTOGRAMA} error={errorDeRequisito(requisitos, ID_MODELO_FOTOGRAMA)}>
          <SelectorModelo
            etiqueta={sinImagen ? "Modelo de la imagen (texto a imagen)" : "Modelo del fotograma"}
            modelos={modelos}
            valor={modeloElegido}
            onCambio={onModelo}
            deshabilitado={deshabilitado}
          />
        </MarcaRequisito>
      )}
    </Paso>
  );
}
