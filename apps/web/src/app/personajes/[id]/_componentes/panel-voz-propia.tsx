"use client";

import { BadgeCheck, Mic, Undo2 } from "lucide-react";
import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { CamposVozRegistrada, type EleccionVozRegistrada } from "@/components/ui/campos-voz-registrada";
import { Aviso } from "@/components/ui/feedback";
import { quitarVozPropia, registrarVozPropia } from "@/components/ui/personajes/api-personajes";
import { soloFecha } from "@/lib/fechas";
import {
  DESCRIPCION_VOZ_OMNI_POR_DEFECTO,
  EJEMPLO_VOZ_OMNI_POR_DEFECTO,
  nombreDeVozOmni,
  VOCES_OMNI,
} from "@/lib/omni";
import type { PersonajeVista } from "@/lib/personajes";

/**
 * **Su voz en las escenas habladas**: la voz registrada propia del personaje, la que suena cuando sale en un podcast
 * o una entrevista. Sin ella habla con la voz del proyecto, que solo vale para el protagonista: dos personajes con la
 * misma voz no se distinguen, y la producción lo avisa antes de cobrar nada.
 *
 * Registrar la voz no cuesta créditos y registra a la vez al personaje con ella (tampoco cuesta). Lo que ya se
 * generó con su voz anterior se queda en la biblioteca; regenerarlo sí cuesta y se confirma antes, como siempre.
 */
export function PanelVozPropia({
  personaje,
  onPersonaje,
}: {
  personaje: PersonajeVista;
  onPersonaje: (personaje: PersonajeVista) => void;
}) {
  const registrada = personaje.vozRegistrada ?? null;
  const [eleccion, setEleccion] = useState<EleccionVozRegistrada>({
    voz: registrada?.voz ?? VOCES_OMNI[0]?.id ?? "",
    descripcion: registrada?.descripcion ?? DESCRIPCION_VOZ_OMNI_POR_DEFECTO,
    ejemplo: registrada?.ejemplo ?? EJEMPLO_VOZ_OMNI_POR_DEFECTO,
  });
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const cambiada =
    registrada === null ||
    registrada.voz !== eleccion.voz ||
    registrada.descripcion !== eleccion.descripcion.trim() ||
    registrada.ejemplo !== eleccion.ejemplo.trim();

  const ejecutar = async (accion: () => ReturnType<typeof quitarVozPropia>) => {
    setOcupado(true);
    setError(null);
    setAviso(null);
    const respuesta = await accion();
    setOcupado(false);
    if (!respuesta.ok) {
      setError(respuesta.error);
      return;
    }
    if (respuesta.datos.avisoRegistro !== "") setAviso(respuesta.datos.avisoRegistro);
    onPersonaje(respuesta.datos.personaje);
  };

  return (
    <div className="flex flex-col gap-4 rounded-tarjeta border-2 border-borde bg-elevada p-4">
      <div>
        <h3 className="text-lg font-bold text-texto">Su voz en las escenas habladas</h3>
        <p className="mt-1 text-sm text-texto-suave">
          En un podcast o una entrevista cada personaje habla con su propia voz. Sin la suya, habla con la voz del
          proyecto, que es la del protagonista. <strong className="text-texto">Registrarla no cuesta créditos</strong> y
          lo deja registrado con ella.
        </p>
      </div>

      {registrada ? (
        <p className="flex items-center gap-1.5 text-sm text-texto-suave">
          <BadgeCheck className="size-4 text-acento" aria-hidden />
          Habla con <strong className="text-texto">{nombreDeVozOmni(registrada.voz)}</strong>, registrada el{" "}
          {soloFecha(registrada.registradaEn)}.
        </p>
      ) : (
        <p className="text-sm text-texto-suave">Todavía no tiene voz propia: habla con la del proyecto.</p>
      )}

      <CamposVozRegistrada etiqueta="Su voz" voces={VOCES_OMNI} valor={eleccion} onCambio={setEleccion} />

      {registrada && cambiada && (
        <Aviso tono="info">
          Si cambias su voz, se registra otra vez con la nueva (sin coste). Las escenas que ya salieron con la anterior
          siguen en tu biblioteca; si las regeneras, cada una cuesta lo que diga su confirmación.
        </Aviso>
      )}
      {error && <Aviso tono="error">{error}</Aviso>}
      {aviso && <Aviso tono="aviso">{aviso}</Aviso>}

      <div className="flex flex-wrap gap-3">
        <Boton
          icono={<Mic className="size-4" />}
          cargando={ocupado}
          disabled={ocupado || !cambiada || eleccion.descripcion.trim() === "" || eleccion.ejemplo.trim() === ""}
          onClick={() =>
            void ejecutar(() =>
              registrarVozPropia(personaje.id, eleccion.voz, eleccion.descripcion.trim(), eleccion.ejemplo.trim()),
            )
          }
        >
          {registrada ? "Registrar su nueva voz" : "Registrar su voz"}
        </Boton>
        {registrada && (
          <Boton
            variante="secundario"
            icono={<Undo2 className="size-4" />}
            disabled={ocupado}
            onClick={() => void ejecutar(() => quitarVozPropia(personaje.id))}
          >
            Usar la voz del proyecto
          </Boton>
        )}
      </div>
    </div>
  );
}
