"use client";

import { Eye, Save, WandSparkles } from "lucide-react";
import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { Casilla } from "@/components/ui/choice";
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
import { DialogoFichaConIA } from "./dialogo-ficha-ia";

/**
 * Pestaña «Ficha»: los campos de apariencia que se añaden al prompt como contexto de generación.
 *
 * Lo que hay que ver antes de guardar:
 *
 * - **guardar crea una versión nueva** si algo de la apariencia cambia, e invalida las aprobaciones que
 *   dependían de la anterior. Se dice aquí, antes de pulsar, no después;
 * - el texto se **limpia** con la misma función que compone el contexto, así que lo que se escribe se ve tal
 *   como se enviará (sin saltos de línea, sin parámetros colados). Se avisa cuando la limpieza cambia algo;
 * - «Ver lo que se enviará» dice de qué versión sale y qué fotos se mandan. **El prompt no se muestra**
 *   (ADR-0022): lo compone el servidor y solo se ve en el panel de administración.
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
  const [conIA, setConIA] = useState(false);
  const [esteticaDeModelo, setEsteticaDeModelo] = useState(personaje.esteticaDeModelo);
  const [probarHoja, setProbarHoja] = useState(personaje.probarHojaIdentidad);

  const cambiado =
    descripcion !== personaje.descripcion ||
    esteticaDeModelo !== personaje.esteticaDeModelo ||
    probarHoja !== personaje.probarHojaIdentidad ||
    CAMPOS_FICHA.some((campo) => campos[campo] !== personaje.ficha[campo]);

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    setAviso(null);
    const respuesta = await guardarFicha(personaje.id, {
      ...Object.fromEntries(CAMPOS_FICHA.map((campo) => [campo, campos[campo]])),
      descripcion,
      motivo,
      // Solo viaja en un personaje inventado: en uno real el servidor la rechaza, y con razón.
      ...(personaje.inventado ? { esteticaDeModelo } : {}),
      ...(personaje.hojaIdentidad ? { probarHojaIdentidad: probarHoja } : {}),
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
    setEsteticaDeModelo(respuesta.datos.esteticaDeModelo);
    setProbarHoja(respuesta.datos.probarHojaIdentidad);
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

      {/*
        Estética de modelo: **solo en inventados** y desmarcada de fábrica (decisión firme del propietario,
        2026-09-28). Con una persona real no se enseña, y aunque alguien la enviara el servidor la rechaza: su
        identidad sale de sus fotos y describir su atractivo sería inventar a otra persona con su cara.
      */}
      {personaje.inventado && (
        <div className="rounded-2xl border border-borde bg-superficie p-4">
          <Casilla
            etiqueta="Quiero que este personaje inventado se describa con estética de modelo"
            descripcion="Desmarcada, se describe como una persona normal. Marcada, se le pide al modelo un acabado de campaña. Solo existe en personajes inventados: a una persona real nunca se la embellece."
            marcada={esteticaDeModelo}
            onCambio={setEsteticaDeModelo}
          />
        </div>
      )}

      {/*
        Probar la hoja 3×3. **Desactivado de fábrica** y solo cuando ya hay hoja (decisión firme del
        propietario, 2026-09-28): activarlo cambia lo que se genera y lo que se paga —la mitad de sus escenas
        saldrán solo con la hoja—, así que lo decide él y se dice con esas palabras.
      */}
      {personaje.hojaIdentidad && (
        <div className="rounded-2xl border border-borde bg-superficie p-4">
          <Casilla
            etiqueta="Probar la hoja en la mitad de mis escenas"
            descripcion="La mitad de tus escenas de este personaje se harán solo con la hoja 3×3 en vez de con sus fotos, para que Jev pueda comparar cuál da mejor parecido. Cuestan lo mismo. Puedes desactivarlo cuando quieras."
            marcada={probarHoja}
            onCambio={setProbarHoja}
          />
        </div>
      )}

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
        {/* La propuesta rellena estos mismos campos: lo que crea la versión sigue siendo «Guardar la ficha». */}
        <Boton
          variante="chispa"
          icono={<WandSparkles className="size-4" />}
          disabled={guardando}
          onClick={() => setConIA(true)}
        >
          Completar la ficha con IA
        </Boton>
        <Boton icono={<Save className="size-4" />} cargando={guardando} disabled={!cambiado} onClick={guardar}>
          Guardar la ficha
        </Boton>
        {/* Se resuelve a partir de la **versión guardada**: mientras haya cambios sin guardar, lo que se
            enseñaría no sería lo que hay en pantalla, así que se pide guardar primero. */}
        <Boton
          variante="secundario"
          icono={<Eye className="size-4" />}
          cargando={pidiendoContexto}
          disabled={cambiado}
          onClick={verContexto}
        >
          Ver lo que se enviará
        </Boton>
        {cambiado && (
          <p className="self-center text-sm text-texto-suave">
            Guarda la ficha para ver el contexto: se compone con la versión guardada, no con lo que hay escrito.
          </p>
        )}
      </div>

      {contexto && <PanelContextoPersonaje contexto={contexto} />}

      <DialogoFichaConIA
        personaje={personaje}
        abierto={conIA}
        onAbiertoCambio={setConIA}
        onAceptar={(propuestos) => {
          setCampos({ ...campos, ...propuestos });
          setAviso(
            "Los campos aceptados están puestos en el formulario. Revísalos y pulsa «Guardar la ficha»: hasta entonces no se ha cambiado nada.",
          );
        }}
      />
    </div>
  );
}
