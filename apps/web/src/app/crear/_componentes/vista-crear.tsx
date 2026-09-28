"use client";

import { useEffect, useState } from "react";
import { DepositoPresupuesto } from "@/components/ui/deposito";
import { Aviso } from "@/components/ui/feedback";
import { AreaTexto, Campo } from "@/components/ui/field";
import { AvisoSinVoz } from "@/components/ui/modelo";
import { Paso } from "@/components/ui/paso";
import { consultarContexto } from "@/components/ui/personajes/api-personajes";
import { PanelContextoPersonaje } from "@/components/ui/personajes/panel-contexto";
import type { ModeloElegible } from "@/lib/catalogo";
import { type EvaluacionVista, evaluacionPendiente } from "@/lib/controles";
import { DIRECCION_CON_ACENTO_VACIA, type DireccionElegidaConAcento, type OpcionesDeDireccion } from "@/lib/direccion";
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
import type { ContextoAplicado, PersonajeElegible } from "@/lib/personajes";
import {
  CATEGORIAS_DE_LA_DIRECCION,
  type CatalogoParaCrear,
  type PresetVisible,
  VARIABLE_TEXTO_MAXIMA,
} from "@/lib/presets";
import { PRODUCTO_ELEGIDO_VACIO, type ProductoElegido } from "@/lib/productos";
import { consultarCatalogoDeDireccion, consultarEstimacion, crearTrabajo, type Resultado } from "./api-generacion";
import { consultarCatalogoDePresets, duplicarPreset } from "./api-presets";
import { BloqueConfirmacion } from "./bloque-confirmacion";
import { DialogoPresetPropio } from "./dialogo-preset-propio";
import { PanelExtraccion } from "./panel-extraccion";
import type { ConfirmacionCoste } from "./panel-generar";
import {
  confirmacionDePlantilla,
  ESTADO_PLANTILLA_VACIO,
  type EstadoPlantilla,
  firmaDePlantilla,
  PanelPlantilla,
  previsualizar,
  sinIncompatibles,
} from "./panel-plantilla";
import { PasoClip } from "./paso-clip";
import { type OrigenDelClip, PasoImagenDePartida, PasoOrigen } from "./paso-origen";
import { PasoSujeto } from "./paso-sujeto";
import { ResultadoTrabajo } from "./resultado-trabajo";
import { SeguimientoTrabajo } from "./seguimiento-trabajo";
import { useControles } from "./use-controles";

/**
 * Los cuatro pasos de «Crear»: elegir la imagen y el modelo, describir la escena, revisar el coste y
 * confirmar, y ver el resultado. Desde el fotograma listo se puede animar un clip, con su propia
 * estimación y su propia confirmación: cada gasto se confirma por separado.
 *
 * El modelo se elige por capacidad entre los del catálogo que se pueden usar (`compatible` o `validado`),
 * y al cambiarlo se vuelve a pedir la estimación: el coste es el de ese modelo, no una media.
 */
/**
 * Duración del clip que se va a pedir: la que se ha estimado (que es la que se paga) y, si el modelo no tarifa
 * ninguna en concreto, la primera que sabe cobrar. `CLIP` es el último recurso.
 */
const segundosDelClip = (estimacion: Estimacion, modelo: ModeloElegible | null) =>
  estimacion.segundos ?? modelo?.duraciones[0] ?? CLIP.segundos;

export function VistaCrear({
  estimacionFotograma,
  estimacionAnimacion,
  modelosFotograma,
  modelosSinImagen,
  modelosClip,
  deposito,
  cola,
  personajes,
  personajeInicial,
  contextoInicial,
  catalogoFotogramaInicial,
  catalogoClipInicial,
  controlesIniciales,
}: {
  estimacionFotograma: Estimacion;
  estimacionAnimacion: Estimacion;
  modelosFotograma: ModeloElegible[];
  /**
   * Modelos que generan **sin imagen de partida** (0.23.4). Son otros modelos y otro precio: mientras no haya
   * personaje ni foto elegidos, la escena se genera con uno de estos.
   */
  modelosSinImagen: ModeloElegible[];
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
  /**
   * Controles previos ya evaluados en el servidor al cargar la página (0.18.0): la zona de claridad «Antes de
   * generar» está rellena desde el primer instante, sin efectos en el navegador.
   */
  controlesIniciales: EvaluacionVista;
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
  /**
   * Clips ya terminados de este mismo fotograma (0.25.1). No se sustituyen: pedir otro clip aparta el que estabas
   * viendo a esta lista y deja el formulario libre. Todos siguen en la biblioteca.
   */
  const [clipsAnteriores, setClipsAnteriores] = useState<TrabajoVista[]>([]);
  /**
   * Cuántas veces has pedido «otro clip» con este fotograma. Entra en la firma de la confirmación: pedirlo es un
   * acto tuyo y estrena confirmación, mientras que un doble clic sobre el mismo botón sigue siendo la misma.
   */
  const [intentoClip, setIntentoClip] = useState(0);
  /** Imagen de la biblioteca que se anima sin generar ningún fotograma (0.25.1). */
  const [imagenDeBiblioteca, setImagenDeBiblioteca] = useState<Medio[]>([]);
  /**
   * Por dónde se empieza: generando un fotograma o trayendo una imagen tuya. De fábrica, generar, que es lo
   * que hacía «Crear» hasta ahora.
   */
  const [origenElegido, setOrigenElegido] = useState<OrigenDelClip>("fotograma");
  /** Cómo se dirige el clip. En «Crear» no hay escena que lo guarde, así que viaja con la confirmación. */
  const [direccionClip, setDireccionClip] = useState<DireccionElegidaConAcento>(DIRECCION_CON_ACENTO_VACIA);
  /**
   * El producto del clip (0.26.0). Va aparte de la dirección: la dirección son claves de catálogo y el producto
   * es una fila tuya. De momento **solo se guarda** con el trabajo; el prompt no cambia todavía.
   */
  const [productoClip, setProductoClip] = useState<ProductoElegido>(PRODUCTO_ELEGIDO_VACIO);
  const [opcionesDireccion, setOpcionesDireccion] = useState<OpcionesDeDireccion | null>(null);
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
  // Controles previos del fotograma y del clip: cada envío se evalúa por separado, como su coste. El clip empieza
  // **sin evaluar** (no hay fotograma que animar todavía), no con la evaluación del fotograma: sus hechos son
  // otros, y heredarla diría «Listo» sobre algo que no se ha comprobado.
  // El catálogo de la dirección se lee una vez al abrir la pantalla: es el mismo para todos los clips.
  useEffect(() => {
    let vivo = true;
    consultarCatalogoDeDireccion().then((r) => {
      if (vivo && r.ok) setOpcionesDireccion(r.datos);
    });
    return () => {
      vivo = false;
    };
  }, []);
  const controlesFoto = useControles(controlesIniciales);
  const controlesClip = useControles(evaluacionPendiente(controlesIniciales.reglasVersion));

  // Sin personaje y sin imagen, la escena sale **solo de la descripción**: otro modelo y otro precio.
  const sinImagen = personajeId === null && imagen.length === 0;
  const modelosDelFotograma = sinImagen ? modelosSinImagen : modelosFotograma;
  const modeloClip = modelosClip.find((m) => m.modelo === estimacionClip.modelo) ?? null;
  const clipConVoz = modeloClip?.conVoz ?? estimacionClip.conVoz;
  const referencia = imagen[0] ?? null;
  const personaje = personajes.find((p) => p.id === personajeId) ?? null;
  const modeloFoto = modelosDelFotograma.find((m) => m.modelo === estimacionFoto.modelo) ?? null;
  const descripcion = prompt.trim();
  const frase = dialogo.trim();
  // Previsualización del prompt, calculada aquí mismo con la **misma** función pura que compone el servidor.
  const previaFoto = previsualizar(catalogoFoto, plantillaFoto, descripcion, personaje?.tipo ?? null);
  // El clip anima **el fotograma**, así que su sujeto es el personaje con el que se hizo ese fotograma, no el que
  // esté elegido ahora arriba: entre los dos envíos se puede haber cambiado de personaje.
  const personajeDelClip = fotograma?.personajeId
    ? (personajes.find((p) => p.id === fotograma.personajeId) ?? null)
    : null;
  /**
   * De qué imagen sale el clip: el fotograma que se acaba de generar o, si no hay ninguno, la imagen que se ha
   * traído de la biblioteca (0.25.1). Generar un fotograma cuesta dinero y muchas veces no hace falta.
   */
  const imagenDelClip = imagenDeBiblioteca[0] ?? null;
  const origenDelClip = fotograma?.medio ?? imagenDelClip;
  const segundosClip = segundosDelClip(estimacionClip, modeloClip);
  /**
   * Con un fotograma generado con personaje se sabe aquí que hace falta la revisión. Con una imagen de la
   * biblioteca **no se sabe**: el personaje lo hereda el servidor de la cadena del medio, y es él quien la exige
   * si toca. Se pide siempre en ese caso, que es el lado seguro: pedirla de más no hace daño, no pedirla sí.
   */
  const clipExigeRevision = fotograma ? fotograma.personajeId !== null : imagenDelClip !== null;
  /**
   * Lo que la dirección del clip ya cubre. El paso del clip **siempre** lleva su panel de dirección, así que el
   * plano, el ángulo, la cámara, el gesto, el registro, la duración y el look se eligen ahí y solo ahí. No
   * depende de que el catálogo haya terminado de cargarse: si dependiera, la botonera duplicada aparecería un
   * instante al abrir la pantalla y bloquearía el botón con un «falta elegir» que no le falta a nadie.
   */
  const cubiertasPorLaDireccion = CATEGORIAS_DE_LA_DIRECCION;
  const previaClip = previsualizar(
    catalogoClip,
    plantillaClip,
    descripcion,
    personajeDelClip?.tipo ?? null,
    cubiertasPorLaDireccion,
  );

  const bloqueosFotograma = [
    // Sin personaje ni imagen no falta nada: se genera a partir de la descripción con un modelo de texto a
    // imagen. Lo que sí falta es que haya alguno con el que hacerlo.
    ...(sinImagen && modelosSinImagen.length === 0
      ? ["Esta instalación no tiene ningún modelo que genere sin imagen de partida: elige un personaje o una foto."]
      : []),
    ...((personaje || referencia) && !sinTerceros ? ["Falta confirmar la revisión de las fotos."] : []),
    ...(personaje && modeloFoto && modeloFoto.maximoReferencias < 1
      ? ["El modelo elegido no acepta fotos de referencia: elige otro para generar con un personaje."]
      : []),
    ...(descripcion.length >= PROMPT_MINIMO ? [] : ["Falta describir la escena."]),
    // Todo lo que impide componer el prompt, con la explicación que da el renderizador: qué falta y qué número
    // está fuera de rango. No se resume en «revisa los datos».
    ...previaFoto.motivos,
  ];

  /**
   * Un fallo de red al enviar no dice si el trabajo se encargó o no: se avisa de eso en lugar de invitar a
   * repetir. Volver a pulsar reenvía la misma confirmación (misma clave), así que tampoco se paga dos veces.
   */
  const mensajeDeFallo = (respuesta: Resultado<TrabajoVista> & { ok: false }) =>
    respuesta.red
      ? `${respuesta.error} Puede que el trabajo se haya enviado: revisa el historial antes de repetirlo.`
      : respuesta.error;

  /**
   * Vuelve a evaluar los controles previos del fotograma con lo que hay elegido ahora. Lo llama la acción que
   * cambia lo evaluado (personaje, imagen o modelo): nunca un efecto.
   */
  const refrescarControles = async (id: string | null, medio: string | undefined, modelo: string) => {
    const fallo = await controlesFoto.refrescar({
      tipo: "fotograma",
      modelo,
      ...(id ? { personajeId: id } : medio ? { medioId: medio } : {}),
    });
    if (fallo) setError(fallo);
  };

  /**
   * Vuelve a evaluar los controles previos **del clip** con la imagen que va a animar. Lo llama la acción que la
   * cambia (elegir una imagen de la biblioteca o terminar un fotograma), nunca un efecto: sus hechos son otros
   * que los del fotograma y heredarlos diría «Listo» sobre algo que no se ha comprobado.
   */
  const refrescarControlesDelClip = async (medioId: string | undefined, modelo: string) => {
    if (!medioId) return;
    const fallo = await controlesClip.refrescar({ tipo: "animacion", modelo, medioId });
    if (fallo) setError(fallo);
  };

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

  /**
   * Al cambiar el sujeto (personaje o imagen) cambia **cómo** se va a generar: con una imagen de partida o sin
   * ella. Y eso cambia el modelo y su precio, así que la estimación se vuelve a pedir al servidor con el modo
   * nuevo. Lo llama la acción que cambia el sujeto, nunca un efecto.
   */
  const refrescarPorSujeto = async (id: string | null, medios: Medio[]) => {
    const ahoraSinImagen = id === null && medios.length === 0;
    const respuesta = await consultarEstimacion("fotograma", undefined, { sinImagen: ahoraSinImagen });
    if (!respuesta.ok) {
      setError(respuesta.error);
      return;
    }
    setEstimacionFoto(respuesta.datos);
    await refrescarContexto(id, respuesta.datos.modelo);
    await refrescarControles(id, medios[0]?.id, respuesta.datos.modelo);
    await refrescarCatalogo("fotograma", respuesta.datos.modelo, undefined, ahoraSinImagen);
  };

  const generarFotograma = async (confirmacion: ConfirmacionCoste) => {
    // Sin personaje ni imagen también se genera: el servidor usa el gemelo texto a imagen del modelo elegido.
    setEnviando("fotograma");
    setError(null);
    const respuesta = await crearTrabajo({
      tipo: "fotograma",
      // La revisión se envía siempre: una imagen suelta puede ser el resultado de otro trabajo hecho con un
      // personaje, y entonces el servidor la exige igual (hereda ese personaje).
      sinTerceros,
      ...(personaje ? { personajeId: personaje.id } : referencia ? { medioId: referencia.id } : {}),
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
    // El clip sale de un fotograma generado o de una imagen tuya; sin ninguno de los dos no hay nada que animar.
    if (!fotograma && !imagenDelClip) return;
    setEnviando("animacion");
    setError(null);
    const respuesta = await crearTrabajo({
      tipo: "animacion",
      ...(fotograma ? { trabajoPadreId: fotograma.id } : { medioId: imagenDelClip?.id }),
      prompt: descripcion,
      dialogo: clipConVoz ? frase : "",
      // La duración que se ha estimado y que se está confirmando: es la tarifa que se va a pagar.
      segundos: segundosClip,
      ...(clipExigeRevision ? { sinTerceros: sinTercerosClip } : {}),
      modelo: estimacionClip.modelo,
      // Lo que has elegido para dirigirlo: claves, nunca texto. El prompt lo compone el servidor (ADR-0022).
      direccion: direccionClip,
      producto: productoClip,
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

  /**
   * Cambia de camino. Al volver a «generar un fotograma» se suelta la imagen traída, y al revés: si no, la
   * pantalla diría que el clip sale de una imagen que ya no se está usando.
   */
  const elegirOrigen = (origen: OrigenDelClip) => {
    setOrigenElegido(origen);
    setError(null);
    if (origen === "fotograma") setImagenDeBiblioteca([]);
    // Pasar a una imagen propia olvida el fotograma generado antes: si no, el clip seguiría saliendo (y
    // cobrándose) de esa otra imagen aunque la pantalla enseñara la elegida.
    if (origen === "imagen") {
      setFotograma(null);
      setAnimacion(null);
    }
    setSinTercerosClip(false);
  };

  /**
   * Otro clip con el mismo fotograma. El que estabas viendo **no se toca**: pasa a la lista de anteriores y sigue
   * en tu biblioteca. Con `precargar`, la dirección se vuelve a abrir tal como se usó en ese clip, que es lo que
   * convierte «otro clip» en «cambiar y volver a generar».
   */
  const otroClip = (precargar: TrabajoVista | null) => {
    setError(null);
    if (animacion) setClipsAnteriores((antes) => [animacion, ...antes]);
    if (precargar?.direccion) setDireccionClip(precargar.direccion);
    setAnimacion(null);
    setIntentoClip((n) => n + 1);
  };

  /** Al terminar el fotograma se vuelve a pedir la estimación del clip: el saldo ya ha cambiado. */
  const alCambiarFotograma = async (trabajo: TrabajoVista) => {
    setFotograma(trabajo);
    if (trabajo.estado !== "listo" || !trabajo.medio) return;
    const respuesta = await consultarEstimacion("animacion", estimacionClip.modelo);
    if (respuesta.ok) setEstimacionClip(respuesta.datos);
    // El clip es otro envío: sus controles se evalúan con el fotograma ya generado, que es su referencia.
    const fallo = await controlesClip.refrescar({
      tipo: "animacion",
      modelo: estimacionClip.modelo,
      medioId: trabajo.medio.id,
    });
    if (fallo) setError(fallo);
  };

  /**
   * Cambiar de modelo cambia el precio, así que se vuelve a pedir la estimación al servidor en lugar de
   * calcularla en el navegador. Si falla, se dice y no se toca la que había: nunca se muestra un coste
   * inventado.
   */
  const elegirModelo = async (tipo: "fotograma" | "animacion", modelo: string, segundos?: number) => {
    setError(null);
    const respuesta = await consultarEstimacion(tipo, modelo, {
      ...(tipo === "fotograma" ? { sinImagen } : {}),
      ...(segundos === undefined ? {} : { segundos }),
    });
    if (!respuesta.ok) {
      setError(respuesta.error);
      return;
    }
    if (tipo === "fotograma") {
      setEstimacionFoto(respuesta.datos);
      // El tope de fotos de referencia es del modelo: al cambiarlo, cambia lo que se va a enviar.
      await refrescarContexto(personajeId, respuesta.datos.modelo);
      await refrescarControles(personajeId, referencia?.id, respuesta.datos.modelo);
    } else {
      setEstimacionClip(respuesta.datos);
      if (fotograma?.medio) {
        await controlesClip.refrescar({
          tipo: "animacion",
          modelo: respuesta.datos.modelo,
          medioId: fotograma.medio.id,
        });
      }
    }
    // Y los formatos y las duraciones que se pueden ofrecer también son del modelo: se vuelven a pedir en
    // lugar de deducirlos aquí, que es lo que dejaría ofrecer algo que el servidor va a rechazar.
    await refrescarCatalogo(tipo, respuesta.datos.modelo, respuesta.datos.segundos ?? undefined);
  };

  /** Presets y plantillas para el modelo indicado. Lectura: no encola nada ni mueve dinero. */
  const refrescarCatalogo = async (
    tipo: "fotograma" | "animacion",
    modelo: string,
    segundos?: number,
    /** Si hay o no imagen de partida **ahora mismo**: quien lo llama tras cambiarla trae el valor nuevo. */
    sinImagenAhora = sinImagen,
  ) => {
    const respuesta = await consultarCatalogoDePresets(tipo, modelo, {
      // Con el mismo modo que la estimación: la botonera no puede ofrecer algo que el servidor vaya a rechazar.
      ...(tipo === "fotograma" ? { sinImagen: sinImagenAhora } : {}),
      ...(segundos === undefined ? {} : { segundos }),
    });
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
  const duplicar = async (tipo: "fotograma" | "animacion", preset: PresetVisible) => {
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

      {/*
        Dos caminos, y se eligen antes que nada: generar un fotograma nuevo o traer una imagen que ya tienes.
        Con una imagen tuya **no hay fotograma que generar**, así que todo ese paso desaparece de la pantalla:
        ni formulario, ni plantilla, ni estimación de algo que no se va a pedir.
      */}
      <PasoOrigen
        numero={1}
        origen={origenElegido}
        deshabilitado={enviando !== null || fotograma !== null || animacion !== null}
        onOrigen={elegirOrigen}
      />

      {origenElegido === "imagen" && (
        <PasoImagenDePartida
          numero={2}
          imagen={imagenDeBiblioteca}
          onImagen={(medios) => {
            setImagenDeBiblioteca(medios);
            setSinTercerosClip(false);
            void refrescarControlesDelClip(medios[0]?.id, estimacionClip.modelo);
          }}
        />
      )}

      {origenElegido === "fotograma" && (
        <>
          <PasoSujeto
            numero={2}
            personajes={personajes}
            personajeId={personajeId}
            personaje={personaje}
            imagen={imagen}
            referencia={referencia}
            modelos={modelosDelFotograma}
            sinImagen={sinImagen}
            modeloElegido={estimacionFoto.modelo}
            modeloFoto={modeloFoto}
            sinTerceros={sinTerceros}
            deshabilitado={enviando !== null}
            onPersonaje={(id) => {
              setPersonajeId(id);
              setSinTerceros(false);
              void refrescarPorSujeto(id, imagen);
            }}
            onImagen={(medios) => {
              setImagen(medios);
              void refrescarPorSujeto(null, medios);
            }}
            onSinTerceros={setSinTerceros}
            onModelo={(modelo) => elegirModelo("fotograma", modelo)}
          />

          <Paso numero={3} titulo="Describe la escena">
            <Campo
              etiqueta="Qué quieres ver"
              ayuda={
                <>
                  Dónde está, qué hace y cómo se ve. Mínimo {PROMPT_MINIMO} caracteres. El clip saldrá con el formato
                  del modelo que elijas para animarlo.{" "}
                  <span className="font-mono">
                    {descripcion.length}/{VARIABLE_TEXTO_MAXIMA}
                  </span>
                  {descripcion.length > VARIABLE_TEXTO_MAXIMA && (
                    <strong className="font-semibold text-texto">
                      {" "}
                      Al componer el prompt se enviarán solo los primeros {VARIABLE_TEXTO_MAXIMA} caracteres: acórtalo
                      tú para decidir qué se queda.
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
            {/*
          Rellenar los campos desde una foto: no cuesta créditos y no genera nada hasta que el usuario lo
          confirma. Lo que devuelve va al campo de arriba, que es el que se envía.
        */}
            <PanelExtraccion
              deshabilitado={enviando !== null}
              onUsar={(texto) => setPrompt(prompt.trim() === "" ? texto : `${prompt.trim()} ${texto}`)}
            />

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
                    Solo se usa en el clip, que tiene voz: el fotograma se genera sin ninguna frase para que los modelos
                    no la dibujen como texto.{" "}
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

          <Paso numero={4} titulo="Revisa el coste y confirma">
            {/* Zona de claridad: el contexto de la ficha y las fotos que se enviarán, antes de confirmar. */}
            {personaje && contexto && contexto.personajeId === personaje.id && (
              <PanelContextoPersonaje contexto={contexto} cargando={pidiendoContexto} />
            )}
            <BloqueConfirmacion
              controles={controlesFoto}
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
            <Paso numero={5} titulo="Resultado del fotograma">
              <div className="flex flex-col gap-4">
                <SeguimientoTrabajo key={fotograma.id} inicial={fotograma} onCambio={alCambiarFotograma} />
                {fotograma.medio && <ResultadoTrabajo trabajo={fotograma} />}
              </div>
            </Paso>
          )}
        </>
      )}

      {/*
        El clip es su propio paso desde la 0.25.1: se puede llegar a él sin generar ningún fotograma, trayendo una
        imagen tuya. Su coste se confirma aparte, como siempre.
      */}
      <PasoClip
        numero={origenElegido === "imagen" ? 3 : fotograma ? 6 : 5}
        origen={origenDelClip}
        modelos={modelosClip}
        estimacion={estimacionClip}
        conVoz={clipConVoz}
        segundos={segundosClip}
        dialogo={dialogo}
        opcionesDireccion={opcionesDireccion}
        direccion={direccionClip}
        producto={productoClip}
        onProducto={setProductoClip}
        catalogo={catalogoClip}
        plantilla={plantillaClip}
        previa={previaClip}
        previaMotivos={previaClip.motivos}
        controles={controlesClip}
        exigeRevision={clipExigeRevision}
        sinTerceros={sinTercerosClip}
        enviando={enviando === "animacion"}
        firma={`animacion|${fotograma?.id ?? ""}|${imagenDelClip?.id ?? ""}|${intentoClip}|${descripcion}|${frase}|${JSON.stringify(direccionClip)}|${JSON.stringify(productoClip)}|${estimacionClip.modelo}|${segundosClip}|${estimacionClip.sello}|${firmaDePlantilla(previaClip, plantillaClip)}`}
        clipEnMarcha={animacion}
        clipsAnteriores={clipsAnteriores}
        accionesDePreset={(preset) => (
          <DialogoPresetPropio
            key={preset.id}
            preset={preset}
            deshabilitado={enviando !== null}
            onGuardado={() => void refrescarCatalogo("animacion", estimacionClip.modelo)}
          />
        )}
        onModelo={(modelo) => elegirModelo("animacion", modelo)}
        onDuracion={(segundos) => void elegirModelo("animacion", estimacionClip.modelo, segundos)}
        onDialogo={setDialogo}
        onDireccion={(campo, valor) => setDireccionClip((antes) => ({ ...antes, [campo]: valor }))}
        onPlantilla={setPlantillaClip}
        onDuplicar={(preset) => void duplicar("animacion", preset)}
        onSinTerceros={setSinTercerosClip}
        onGenerar={generarAnimacion}
        onCambioClip={setAnimacion}
        onOtroClip={otroClip}
      />
    </div>
  );
}
