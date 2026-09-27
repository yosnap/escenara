"use client";

import { useState } from "react";
import { Casilla } from "@/components/ui/choice";
import { DepositoPresupuesto } from "@/components/ui/deposito";
import { Aviso } from "@/components/ui/feedback";
import { AreaTexto, Campo } from "@/components/ui/field";
import { SelectorMedios } from "@/components/ui/media/selector-medios";
import { AvisoSinVoz, SelectorModelo } from "@/components/ui/modelo";
import { Paso } from "@/components/ui/paso";
import { SelectorPersonaje } from "@/components/ui/personaje";
import { consultarContexto } from "@/components/ui/personajes/api-personajes";
import { PanelContextoPersonaje } from "@/components/ui/personajes/panel-contexto";
import type { ModeloElegible } from "@/lib/catalogo";
import {
  CLIP,
  type Deposito,
  DIALOGO_MAXIMO,
  type EstadoCola,
  type Estimacion,
  PROMPT_MINIMO,
  type TrabajoVista,
} from "@/lib/generacion";
import type { Medio } from "@/lib/media/tipos";
import { AVISO_SIN_TERCEROS, type ContextoAplicado, type PersonajeElegible } from "@/lib/personajes";
import { type CatalogoParaCrear, type PresetElegible, VARIABLE_TEXTO_MAXIMA } from "@/lib/presets";
import { consultarEstimacion, crearTrabajo, type Resultado } from "./api-generacion";
import { consultarCatalogoDePresets, duplicarPreset } from "./api-presets";
import { DialogoPresetPropio } from "./dialogo-preset-propio";
import { type ConfirmacionCoste, PanelGenerar } from "./panel-generar";
import {
  confirmacionDePlantilla,
  ESTADO_PLANTILLA_VACIO,
  type EstadoPlantilla,
  firmaDePlantilla,
  PanelPlantilla,
  previsualizar,
  sinIncompatibles,
} from "./panel-plantilla";
import { ResultadoTrabajo } from "./resultado-trabajo";
import { SeguimientoTrabajo } from "./seguimiento-trabajo";

/**
 * Los cuatro pasos de «Crear»: elegir la imagen y el modelo, describir la escena, revisar el coste y
 * confirmar, y ver el resultado. Desde el fotograma listo se puede animar un clip, con su propia
 * estimación y su propia confirmación: cada gasto se confirma por separado.
 *
 * El modelo se elige por capacidad entre los del catálogo que se pueden usar (`compatible` o `validado`),
 * y al cambiarlo se vuelve a pedir la estimación: el coste es el de ese modelo, no una media.
 */
/** Duración del clip según el modelo elegido; si no la declara, la de referencia del proyecto. */
const segundosDelClip = (modelo: ModeloElegible | null) => modelo?.duraciones[0] ?? CLIP.segundos;

export function VistaCrear({
  estimacionFotograma,
  estimacionAnimacion,
  modelosFotograma,
  modelosClip,
  deposito,
  cola,
  personajes,
  personajeInicial,
  contextoInicial,
  catalogoFotogramaInicial,
  catalogoClipInicial,
}: {
  estimacionFotograma: Estimacion;
  estimacionAnimacion: Estimacion;
  modelosFotograma: ModeloElegible[];
  modelosClip: ModeloElegible[];
  deposito: Deposito;
  cola: EstadoCola;
  /** Personajes propios; los que no pueden generar salen deshabilitados con su motivo. */
  personajes: PersonajeElegible[];
  /** Personaje preseleccionado al llegar desde su ficha («Generar con él»). */
  personajeInicial: string | null;
  /** Contexto ya resuelto en el servidor para ese personaje, si venía preseleccionado. */
  contextoInicial: ContextoAplicado | null;
  /**
   * Presets y plantillas que este usuario puede usar, con lo que el modelo predeterminado no admite y por qué
   * (0.16.0). Se vuelven a pedir al cambiar de modelo, porque los formatos y las duraciones son suyos.
   */
  catalogoFotogramaInicial: CatalogoParaCrear;
  catalogoClipInicial: CatalogoParaCrear;
}) {
  const [personajeId, setPersonajeId] = useState<string | null>(personajeInicial);
  /**
   * Contexto que el servidor va a añadir al prompt y fotos que va a enviar. Se pide al elegir personaje y al
   * cambiar de modelo (el tope de fotos es del modelo), nunca en un efecto: lo pide la acción que lo cambia.
   */
  const [contexto, setContexto] = useState<ContextoAplicado | null>(contextoInicial);
  const [pidiendoContexto, setPidiendoContexto] = useState(false);
  const [sinTerceros, setSinTerceros] = useState(false);
  // La revisión del clip es una confirmación distinta sobre un envío distinto, así que tiene su propia casilla.
  const [sinTercerosClip, setSinTercerosClip] = useState(false);
  const [imagen, setImagen] = useState<Medio[]>([]);
  const [prompt, setPrompt] = useState("");
  const [dialogo, setDialogo] = useState("");
  const [fotograma, setFotograma] = useState<TrabajoVista | null>(null);
  const [animacion, setAnimacion] = useState<TrabajoVista | null>(null);
  const [estimacionFoto, setEstimacionFoto] = useState(estimacionFotograma);
  const [estimacionClip, setEstimacionClip] = useState(estimacionAnimacion);
  const [enviando, setEnviando] = useState<"fotograma" | "animacion" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [catalogoFoto, setCatalogoFoto] = useState(catalogoFotogramaInicial);
  const [catalogoClip, setCatalogoClip] = useState(catalogoClipInicial);
  // Plantilla y presets elegidos. Empiezan en la primera plantilla activa de cada capacidad, que es la que la
  // instalación ofrece por defecto.
  const [plantillaFoto, setPlantillaFoto] = useState<EstadoPlantilla>({
    ...ESTADO_PLANTILLA_VACIO,
    plantillaId: catalogoFotogramaInicial.plantillas[0]?.id ?? "",
  });
  const [plantillaClip, setPlantillaClip] = useState<EstadoPlantilla>({
    ...ESTADO_PLANTILLA_VACIO,
    plantillaId: catalogoClipInicial.plantillas[0]?.id ?? "",
  });

  const modeloClip = modelosClip.find((m) => m.modelo === estimacionClip.modelo) ?? null;
  const clipConVoz = modeloClip?.conVoz ?? estimacionClip.conVoz;
  const referencia = imagen[0] ?? null;
  const personaje = personajes.find((p) => p.id === personajeId) ?? null;
  const modeloFoto = modelosFotograma.find((m) => m.modelo === estimacionFoto.modelo) ?? null;
  const descripcion = prompt.trim();
  const frase = dialogo.trim();
  // Previsualización del prompt, calculada aquí mismo con la **misma** función pura que compone el servidor.
  const previaFoto = previsualizar(catalogoFoto, plantillaFoto, descripcion, personaje?.tipo ?? null);
  // El clip anima **el fotograma**, así que su sujeto es el personaje con el que se hizo ese fotograma, no el que
  // esté elegido ahora arriba: entre los dos envíos se puede haber cambiado de personaje.
  const personajeDelClip = fotograma?.personajeId
    ? (personajes.find((p) => p.id === fotograma.personajeId) ?? null)
    : null;
  const previaClip = previsualizar(catalogoClip, plantillaClip, descripcion, personajeDelClip?.tipo ?? null);

  const bloqueosFotograma = [
    ...(personaje || referencia ? [] : ["Elige un personaje o una imagen de referencia."]),
    ...((personaje || referencia) && !sinTerceros ? ["Falta confirmar la revisión de las fotos."] : []),
    ...(personaje && modeloFoto && modeloFoto.maximoReferencias < 1
      ? ["El modelo elegido no acepta fotos de referencia: elige otro para generar con un personaje."]
      : []),
    ...(descripcion.length >= PROMPT_MINIMO ? [] : ["Falta describir la escena."]),
    // Todo lo que impide componer el prompt, con la explicación que da el renderizador: qué falta y qué número
    // está fuera de rango. No se resume en «revisa los datos».
    ...previaFoto.motivos,
    ...(estimacionFoto.alcanza ? [] : ["Tu saldo de KIE no llega para este trabajo."]),
  ];

  /**
   * Un fallo de red al enviar no dice si el trabajo se encargó o no: se avisa de eso en lugar de invitar a
   * repetir. Volver a pulsar reenvía la misma confirmación (misma clave), así que tampoco se paga dos veces.
   */
  const mensajeDeFallo = (respuesta: Resultado<TrabajoVista> & { ok: false }) =>
    respuesta.red
      ? `${respuesta.error} Puede que el trabajo se haya enviado: revisa el historial antes de repetirlo.`
      : respuesta.error;

  /** Pide el contexto aplicado de un personaje con el modelo que esté elegido. Sin personaje, se limpia. */
  const refrescarContexto = async (id: string | null, modelo: string) => {
    if (!id) {
      setContexto(null);
      return;
    }
    setPidiendoContexto(true);
    const respuesta = await consultarContexto(id, modelo);
    setPidiendoContexto(false);
    // Un fallo aquí no impide generar: lo que decide es el servidor al encolar. Se dice y no se muestra nada.
    if (!respuesta.ok) {
      setContexto(null);
      setError(respuesta.error);
      return;
    }
    setContexto(respuesta.datos);
  };

  const generarFotograma = async (confirmacion: ConfirmacionCoste) => {
    if (!personaje && !referencia) return;
    setEnviando("fotograma");
    setError(null);
    const respuesta = await crearTrabajo({
      tipo: "fotograma",
      // La revisión se envía siempre: una imagen suelta puede ser el resultado de otro trabajo hecho con un
      // personaje, y entonces el servidor la exige igual (hereda ese personaje).
      sinTerceros,
      ...(personaje ? { personajeId: personaje.id } : { medioId: referencia?.id }),
      // La versión que se estaba mirando: si el servidor usaría otra, responde 409 y no se gasta nada.
      ...(personaje && contexto?.personajeId === personaje.id && contexto.versionId !== ""
        ? { versionPersonaje: contexto.versionId }
        : {}),
      prompt: descripcion,
      modelo: estimacionFoto.modelo,
      // Plantilla, versión y presets elegidos: el prompt lo compone el servidor con ellos, no con este texto.
      ...confirmacionDePlantilla(previaFoto, plantillaFoto),
      ...confirmacion,
    });
    setEnviando(null);
    if (!respuesta.ok) {
      setError(mensajeDeFallo(respuesta));
      return;
    }
    setAnimacion(null);
    setFotograma(respuesta.datos);
  };

  const generarAnimacion = async (confirmacion: ConfirmacionCoste) => {
    if (!fotograma) return;
    setEnviando("animacion");
    setError(null);
    const respuesta = await crearTrabajo({
      tipo: "animacion",
      trabajoPadreId: fotograma.id,
      prompt: descripcion,
      dialogo: clipConVoz ? frase : "",
      ...(fotograma.personajeId ? { sinTerceros: sinTercerosClip } : {}),
      modelo: estimacionClip.modelo,
      ...confirmacionDePlantilla(previaClip, plantillaClip),
      ...confirmacion,
    });
    setEnviando(null);
    if (!respuesta.ok) {
      setError(mensajeDeFallo(respuesta));
      return;
    }
    setAnimacion(respuesta.datos);
  };

  /** Al terminar el fotograma se vuelve a pedir la estimación del clip: el saldo ya ha cambiado. */
  const alCambiarFotograma = async (trabajo: TrabajoVista) => {
    setFotograma(trabajo);
    if (trabajo.estado !== "listo" || !trabajo.medio) return;
    const respuesta = await consultarEstimacion("animacion", estimacionClip.modelo);
    if (respuesta.ok) setEstimacionClip(respuesta.datos);
  };

  /**
   * Cambiar de modelo cambia el precio, así que se vuelve a pedir la estimación al servidor en lugar de
   * calcularla en el navegador. Si falla, se dice y no se toca la que había: nunca se muestra un coste
   * inventado.
   */
  const elegirModelo = async (tipo: "fotograma" | "animacion", modelo: string) => {
    setError(null);
    const respuesta = await consultarEstimacion(tipo, modelo);
    if (!respuesta.ok) {
      setError(respuesta.error);
      return;
    }
    if (tipo === "fotograma") {
      setEstimacionFoto(respuesta.datos);
      // El tope de fotos de referencia es del modelo: al cambiarlo, cambia lo que se va a enviar.
      await refrescarContexto(personajeId, respuesta.datos.modelo);
    } else setEstimacionClip(respuesta.datos);
    // Y los formatos y las duraciones que se pueden ofrecer también son del modelo: se vuelven a pedir en
    // lugar de deducirlos aquí, que es lo que dejaría ofrecer algo que el servidor va a rechazar.
    await refrescarCatalogo(tipo, respuesta.datos.modelo);
  };

  /** Presets y plantillas para el modelo indicado. Lectura: no encola nada ni mueve dinero. */
  const refrescarCatalogo = async (tipo: "fotograma" | "animacion", modelo: string) => {
    const respuesta = await consultarCatalogoDePresets(tipo, modelo);
    if (!respuesta.ok) {
      setError(respuesta.error);
      return;
    }
    if (tipo === "fotograma") {
      setCatalogoFoto(respuesta.datos);
      setPlantillaFoto((previo) => sinIncompatibles(previo, respuesta.datos));
    } else {
      setCatalogoClip(respuesta.datos);
      setPlantillaClip((previo) => sinIncompatibles(previo, respuesta.datos));
    }
  };

  /**
   * Duplica un preset de la instalación para que el usuario pueda editarlo en «Tus presets». La copia aparece
   * al momento en la botonera, marcada como tuya.
   */
  const duplicar = async (tipo: "fotograma" | "animacion", preset: PresetElegible) => {
    setError(null);
    const respuesta = await duplicarPreset(preset.id);
    if (!respuesta.ok) {
      setError(respuesta.error);
      return;
    }
    await refrescarCatalogo(tipo, tipo === "fotograma" ? estimacionFoto.modelo : estimacionClip.modelo);
  };

  return (
    <div className="flex flex-col gap-6">
      <DepositoPresupuesto deposito={deposito} cola={cola} />

      <Paso numero={1} titulo="Elige a quién generas">
        <SelectorPersonaje
          personajes={personajes}
          valor={personajeId}
          onCambio={(id) => {
            setPersonajeId(id);
            setSinTerceros(false);
            void refrescarContexto(id, estimacionFoto.modelo);
          }}
          deshabilitado={enviando !== null}
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
            onCambio={setImagen}
          />
        )}
        {(personaje || referencia) && (
          <div className="rounded-tarjeta border-2 border-borde bg-superficie p-4">
            <Casilla
              etiqueta="En estas fotos no aparece ninguna otra persona ni ningún menor"
              descripcion={AVISO_SIN_TERCEROS}
              marcada={sinTerceros}
              deshabilitado={enviando !== null}
              onCambio={setSinTerceros}
            />
          </div>
        )}
        {modelosFotograma.length > 1 && (
          <SelectorModelo
            etiqueta="Modelo del fotograma"
            modelos={modelosFotograma}
            valor={estimacionFoto.modelo}
            onCambio={(modelo) => elegirModelo("fotograma", modelo)}
            deshabilitado={enviando !== null}
          />
        )}
      </Paso>

      <Paso numero={2} titulo="Describe la escena">
        <Campo
          etiqueta="Qué quieres ver"
          ayuda={
            <>
              Dónde está, qué hace y cómo se ve. Mínimo {PROMPT_MINIMO} caracteres. El clip saldrá con el formato del
              modelo que elijas para animarlo.{" "}
              <span className="font-mono">
                {descripcion.length}/{VARIABLE_TEXTO_MAXIMA}
              </span>
              {descripcion.length > VARIABLE_TEXTO_MAXIMA && (
                <strong className="font-semibold text-texto">
                  {" "}
                  Al componer el prompt se enviarán solo los primeros {VARIABLE_TEXTO_MAXIMA} caracteres: acórtalo tú
                  para decidir qué se queda.
                </strong>
              )}
            </>
          }
        >
          {(props) => (
            <AreaTexto
              {...props}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="En una cafetería luminosa, saluda a cámara con una sonrisa, luz natural, aspecto de móvil."
            />
          )}
        </Campo>
        {/* Los botones son el corazón de «Crear»: la escena que se escribe arriba es una de las variables. */}
        <PanelPlantilla
          catalogo={catalogoFoto}
          estado={plantillaFoto}
          previa={previaFoto}
          deshabilitado={enviando !== null}
          onCambio={setPlantillaFoto}
          onDuplicar={(preset) => void duplicar("fotograma", preset)}
          accionesDePreset={(preset) => (
            <DialogoPresetPropio
              key={preset.id}
              preset={preset}
              deshabilitado={enviando !== null}
              onGuardado={() => void refrescarCatalogo("fotograma", estimacionFoto.modelo)}
            />
          )}
        />
        {clipConVoz ? (
          <Campo
            etiqueta="Lo que dice (opcional)"
            ayuda={
              <>
                Solo se usa en el clip, que tiene voz: el fotograma se genera sin ninguna frase para que los modelos no
                la dibujen como texto.{" "}
                <span className="font-mono">
                  {dialogo.length}/{DIALOGO_MAXIMO}
                </span>
              </>
            }
          >
            {(props) => (
              <AreaTexto
                {...props}
                value={dialogo}
                maxLength={DIALOGO_MAXIMO}
                onChange={(e) => setDialogo(e.target.value)}
                className="min-h-20"
                placeholder="¡Estamos muy contentos de lanzar esto!"
              />
            )}
          </Campo>
        ) : (
          <AvisoSinVoz />
        )}
      </Paso>

      <Paso numero={3} titulo="Revisa el coste y confirma">
        {/* Zona de claridad: el contexto de la ficha y las fotos que se enviarán, antes de confirmar. */}
        {personaje && contexto && contexto.personajeId === personaje.id && (
          <PanelContextoPersonaje contexto={contexto} cargando={pidiendoContexto} />
        )}
        <PanelGenerar
          estimacion={estimacionFoto}
          etiqueta="Generar fotograma"
          firma={`fotograma|${personaje?.id ?? ""}|${contexto?.personajeId === personaje?.id ? contexto?.versionId : ""}|${referencia?.id ?? ""}|${descripcion}|${estimacionFoto.modelo}|${estimacionFoto.sello}|${firmaDePlantilla(previaFoto, plantillaFoto)}`}
          bloqueos={bloqueosFotograma}
          enviando={enviando === "fotograma"}
          onGenerar={generarFotograma}
        />
      </Paso>

      {error && <Aviso tono="error">{error}</Aviso>}

      {fotograma && (
        <Paso numero={4} titulo="Resultado">
          <div className="flex flex-col gap-4">
            <SeguimientoTrabajo key={fotograma.id} inicial={fotograma} onCambio={alCambiarFotograma} />
            {fotograma.medio && (
              <ResultadoTrabajo trabajo={fotograma}>
                {!animacion && (
                  <div className="flex flex-col gap-4">
                    {modelosClip.length > 1 && (
                      <SelectorModelo
                        etiqueta="Modelo del clip"
                        modelos={modelosClip}
                        valor={estimacionClip.modelo}
                        onCambio={(modelo) => elegirModelo("animacion", modelo)}
                        deshabilitado={enviando !== null}
                      />
                    )}
                    {!clipConVoz && <AvisoSinVoz />}
                    {fotograma.personajeId && (
                      <Casilla
                        etiqueta="En estas fotos no aparece ninguna otra persona ni ningún menor"
                        descripcion={AVISO_SIN_TERCEROS}
                        marcada={sinTercerosClip}
                        deshabilitado={enviando !== null}
                        onCambio={setSinTercerosClip}
                      />
                    )}
                    <PanelPlantilla
                      catalogo={catalogoClip}
                      estado={plantillaClip}
                      previa={previaClip}
                      deshabilitado={enviando !== null}
                      onCambio={setPlantillaClip}
                      onDuplicar={(preset) => void duplicar("animacion", preset)}
                      accionesDePreset={(preset) => (
                        <DialogoPresetPropio
                          key={preset.id}
                          preset={preset}
                          deshabilitado={enviando !== null}
                          onGuardado={() => void refrescarCatalogo("animacion", estimacionClip.modelo)}
                        />
                      )}
                    />
                    <PanelGenerar
                      estimacion={estimacionClip}
                      etiqueta={`Animar ${segundosDelClip(modeloClip)} s`}
                      firma={`animacion|${fotograma.id}|${descripcion}|${frase}|${estimacionClip.modelo}|${estimacionClip.sello}|${firmaDePlantilla(previaClip, plantillaClip)}`}
                      bloqueos={[
                        ...previaClip.motivos,
                        ...(estimacionClip.alcanza ? [] : ["Tu saldo de KIE no llega para el clip."]),
                        ...(fotograma.personajeId && !sinTercerosClip
                          ? ["Falta confirmar la revisión de las fotos del personaje."]
                          : []),
                      ]}
                      enviando={enviando === "animacion"}
                      onGenerar={generarAnimacion}
                    />
                  </div>
                )}
              </ResultadoTrabajo>
            )}
            {animacion && (
              <>
                <SeguimientoTrabajo key={animacion.id} inicial={animacion} onCambio={setAnimacion} />
                {animacion.medio && <ResultadoTrabajo trabajo={animacion} />}
              </>
            )}
          </div>
        </Paso>
      )}
    </div>
  );
}
