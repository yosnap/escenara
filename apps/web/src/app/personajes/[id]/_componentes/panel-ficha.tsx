"use client";

import { Eye, Save } from "lucide-react";
import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { Aviso } from "@/components/ui/feedback";
import { AreaTexto, Campo, EntradaTexto } from "@/components/ui/field";
import { consultarContexto, guardarFicha } from "@/components/ui/personajes/api-personajes";
import { PanelContextoPersonaje } from "@/components/ui/personajes/panel-contexto";
import {
  AYUDA_CAMPO_FICHA,
  CAMPO_FICHA_MAXIMO,
  CAMPOS_FICHA,
  type CampoFicha,
  ETIQUETA_CAMPO_FICHA,
  limpiarCampoFicha,
} from "@/lib/ficha-personaje";
import { type ContextoAplicado, DESCRIPCION_MAXIMA, MOTIVO_CAMBIO_MAXIMO, type PersonajeVista } from "@/lib/personajes";

/**
 * Pestaña «Ficha»: los campos de apariencia que se añaden al prompt como contexto de generación.
 *
 * Lo que hay que ver antes de guardar:
 *
 * - **guardar crea una versión nueva** si algo de la apariencia cambia, e invalida las aprobaciones que
 *   dependían de la anterior. Se dice aquí, antes de pulsar, no después;
 * - el texto se **limpia** con la misma función que compone el contexto, así que lo que se escribe se ve tal
 *   como se enviará (sin saltos de línea, sin parámetros colados). Se avisa cuando la limpieza cambia algo;
 * - «Ver el contexto aplicado» lo pide al servidor: el prompt lo compone él, no el navegador.
 */
export function PanelFicha({
  personaje,
  onPersonaje,
}: {
  personaje: PersonajeVista;
  /** Personaje recalculado por el servidor, con su versión vigente ya actualizada. */
  onPersonaje: (personaje: PersonajeVista) => void;
}) {
  const [campos, setCampos] = useState<Record<CampoFicha, string>>({ ...personaje.ficha });
  const [descripcion, setDescripcion] = useState(personaje.descripcion);
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [contexto, setContexto] = useState<ContextoAplicado | null>(null);
  const [pidiendoContexto, setPidiendoContexto] = useState(false);

  const cambiado =
    descripcion !== personaje.descripcion || CAMPOS_FICHA.some((campo) => campos[campo] !== personaje.ficha[campo]);

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    setAviso(null);
    const respuesta = await guardarFicha(personaje.id, {
      ...Object.fromEntries(CAMPOS_FICHA.map((campo) => [campo, campos[campo]])),
      descripcion,
      motivo,
    });
    setGuardando(false);
    if (!respuesta.ok) {
      setError(respuesta.error);
      return;
    }
    const anterior = personaje.versionVigente?.numero ?? 0;
    const ahora = respuesta.datos.versionVigente?.numero ?? 0;
    setAviso(
      ahora > anterior
        ? `Guardado como versión ${ahora}. Las aprobaciones que dependían de la anterior quedan marcadas para revisar en la pestaña «Versiones».`
        : "Guardado. No había ningún cambio de apariencia, así que no se ha creado una versión nueva.",
    );
    setMotivo("");
    setCampos({ ...respuesta.datos.ficha });
    setDescripcion(respuesta.datos.descripcion);
    setContexto(null);
    onPersonaje(respuesta.datos);
  };

  const verContexto = async () => {
    setPidiendoContexto(true);
    setError(null);
    const respuesta = await consultarContexto(personaje.id);
    setPidiendoContexto(false);
    if (!respuesta.ok) {
      setError(respuesta.error);
      return;
    }
    setContexto(respuesta.datos);
  };

  /** Lo que de verdad se guardaría de este campo, ya limpio. Sirve para avisar de lo que se descarta. */
  const limpio = (campo: CampoFicha) => limpiarCampoFicha(campos[campo]);

  return (
    <div className="flex flex-col gap-6">
      <Aviso tono="info">
        Esta ficha no es un archivo: su texto se <strong className="font-semibold">añade al prompt</strong> de cada
        fotograma y de cada clip que hagas con «{personaje.nombre}», junto con sus mejores fotos. Guardar un cambio de
        apariencia crea una versión nueva e invalida las aprobaciones que dependían de la anterior.
      </Aviso>

      {CAMPOS_FICHA.map((campo) => (
        <Campo
          key={campo}
          etiqueta={ETIQUETA_CAMPO_FICHA[campo]}
          ayuda={
            <>
              {AYUDA_CAMPO_FICHA[campo]}{" "}
              <span className="font-mono">
                {campos[campo].length}/{CAMPO_FICHA_MAXIMO}
              </span>
              {limpio(campo) !== campos[campo].trim().replace(/\s+/g, " ") && (
                <strong className="font-semibold"> Al guardar se enviará: «{limpio(campo)}».</strong>
              )}
            </>
          }
        >
          {(props) => (
            <EntradaTexto
              {...props}
              value={campos[campo]}
              maxLength={CAMPO_FICHA_MAXIMO}
              onChange={(e) => setCampos({ ...campos, [campo]: e.target.value })}
            />
          )}
        </Campo>
      ))}

      <Campo
        etiqueta="Descripción"
        ayuda="Texto libre del personaje. También versiona: forma parte de lo que se le envía al modelo."
      >
        {(props) => (
          <AreaTexto
            {...props}
            value={descripcion}
            maxLength={DESCRIPCION_MAXIMA}
            onChange={(e) => setDescripcion(e.target.value)}
          />
        )}
      </Campo>

      <Campo
        etiqueta="Motivo del cambio (opcional)"
        ayuda="Queda escrito en la versión que produzca este cambio. Una línea basta: «ahora lleva gafas»."
      >
        {(props) => (
          <EntradaTexto
            {...props}
            value={motivo}
            maxLength={MOTIVO_CAMBIO_MAXIMO}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ahora lleva gafas y pelo más corto"
          />
        )}
      </Campo>

      {error && <Aviso tono="error">{error}</Aviso>}
      {aviso && <Aviso tono="correcto">{aviso}</Aviso>}

      <div className="flex flex-wrap gap-3">
        <Boton icono={<Save className="size-4" />} cargando={guardando} disabled={!cambiado} onClick={guardar}>
          Guardar la ficha
        </Boton>
        {/* El contexto se compone a partir de la **versión guardada**: mientras haya cambios sin guardar, lo
            que se enseñaría no sería lo que hay en pantalla, así que se pide guardar primero. */}
        <Boton
          variante="secundario"
          icono={<Eye className="size-4" />}
          cargando={pidiendoContexto}
          disabled={cambiado}
          onClick={verContexto}
        >
          Ver el contexto aplicado
        </Boton>
        {cambiado && (
          <p className="self-center text-sm text-texto-suave">
            Guarda la ficha para ver el contexto: se compone con la versión guardada, no con lo que hay escrito.
          </p>
        )}
      </div>

      {contexto && <PanelContextoPersonaje contexto={contexto} />}
    </div>
  );
}
