"use client";

import { useEffect, useRef, useState } from "react";
import { DepositoPresupuesto } from "@/components/ui/deposito";
import { Aviso } from "@/components/ui/feedback";
import { Multipaso, PanelDePaso, useMultipaso } from "@/components/ui/multipaso";
import { consultarContexto } from "@/components/ui/personajes/api-personajes";
import type { ModeloElegible } from "@/lib/catalogo";
import { type EvaluacionVista, evaluacionPendiente } from "@/lib/controles";
import { DIRECCION_CON_ACENTO_VACIA, type DireccionElegidaConAcento, type OpcionesDeDireccion } from "@/lib/direccion";
import type { Deposito, EstadoCola, Estimacion, TrabajoVista } from "@/lib/generacion";
import type { Medio } from "@/lib/media/tipos";
import { resolverPaso } from "@/lib/multipaso";
import { numeroDePaso, pasoPredeterminadoDeCrear, pasosDeCrear } from "@/lib/pasos-crear";
import type { ContextoAplicado, PersonajeElegible } from "@/lib/personajes";
import { CATEGORIAS_DE_LA_DIRECCION, type CatalogoParaCrear, type PresetVisible } from "@/lib/presets";
import { PRODUCTO_ELEGIDO_VACIO, type ProductoElegido } from "@/lib/productos";
import { requisitosDeCrear, variableDeTexto } from "@/lib/requisitos-crear";
import { eleccionSinLoDecidido, segundosParaTrend } from "@/lib/trends";
import { consultarCatalogoDeDireccion, consultarEstimacion, crearTrabajo, mensajeDeFallo } from "./api-generacion";
import { consultarCatalogoDePresets, duplicarPreset } from "./api-presets";
import { DialogoPresetPropio } from "./dialogo-preset-propio";
import { cobrablesDe, segundosDelClip } from "./duracion-del-clip";
import type { ConfirmacionCoste } from "./panel-generar";
import {
  confirmacionDePlantilla,
  ESTADO_PLANTILLA_VACIO,
  type EstadoPlantilla,
  firmaDePlantilla,
  previsualizar,
  sinIncompatibles,
} from "./panel-plantilla";
import { PasoClip } from "./paso-clip";
import { PasoEscena } from "./paso-escena";
import { PasoFormato } from "./paso-formato";
import { PasoCosteFotograma, PasoResultadoFotograma } from "./paso-fotograma";
import { type OrigenDelClip, PasoImagenDePartida, PasoOrigen } from "./paso-origen";
import { PasoSujeto } from "./paso-sujeto";
import { type ClipVigente, comprobarClipVigente } from "./refresco-de-controles";
import { contextosDeConfirmacion, useConfirmacionCoste } from "./use-confirmacion-coste";
import { useControles } from "./use-controles";
import { useFormatoClip } from "./use-formato-clip";
import { useLugarDeCrear } from "./use-lugar-crear";
import { useRequisitosSenalados } from "./use-requisitos-senalados";

/**
 * Los pasos de «Crear», uno a la vez con su barra (0.33.0): el formato (plantilla normal o trend), de dónde sale
 * el clip, a quién generas, describir la escena, revisar el coste y confirmar, ver el resultado y animar el clip,
 * cada gasto con su propia estimación y su propia confirmación. Con una imagen tuya solo quedan formato, origen,
 * imagen y clip.
 *
 * El formato va primero porque el trend decide la duración y si se habla. Todo el estado vive aquí y los paneles
 * de los pasos no se desmontan al cambiar de paso: un trabajo en marcha, su seguimiento y la clave de una
 * confirmación siguen igual aunque vayas y vuelvas. El modelo se elige por capacidad y al cambiarlo se vuelve a
 * pedir la estimación: el coste es el de ese modelo, no una media.
 */
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
  pasoPedido,
}: {
  /** Paso pedido en la dirección (`?paso=`), ya validado; `null` si no se ha pedido ninguno. */
  pasoPedido: string | null;
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
  /** Contexto y fotos que el servidor va a enviar: lo pide la acción que lo cambia (personaje o modelo), no un efecto. */
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
  /** Clips ya terminados de este fotograma: pedir otro aparta el que veías a esta lista y no se sustituye ninguno. */
  const [clipsAnteriores, setClipsAnteriores] = useState<TrabajoVista[]>([]);
  /** Veces que has pedido «otro clip»: entra en la firma, así que pedirlo estrena confirmación y un doble clic no. */
  const [intentoClip, setIntentoClip] = useState(0);
  /** Imagen de la biblioteca que se anima sin generar ningún fotograma (0.25.1). */
  const [imagenDeBiblioteca, setImagenDeBiblioteca] = useState<Medio[]>([]);
  /** Por dónde se empieza: generando un fotograma (de fábrica) o trayendo una imagen tuya. */
  const [origenElegido, setOrigenElegido] = useState<OrigenDelClip>("fotograma");
  /** Cómo se dirige el clip. En «Crear» no hay escena que lo guarde, así que viaja con la confirmación. */
  const [direccionClip, setDireccionClip] = useState<DireccionElegidaConAcento>(DIRECCION_CON_ACENTO_VACIA);
  /** El producto del clip: va aparte de la dirección (claves de catálogo) porque es una fila tuya. Solo se guarda. */
  const [productoClip, setProductoClip] = useState<ProductoElegido>(PRODUCTO_ELEGIDO_VACIO);
  const [opcionesDireccion, setOpcionesDireccion] = useState<OpcionesDeDireccion | null>(null);
  const [estimacionFoto, setEstimacionFoto] = useState(estimacionFotograma);
  const [estimacionClip, setEstimacionClip] = useState(estimacionAnimacion);
  // Lo último elegido del clip: un refresco que sigue tras una espera evalúa lo vigente, no lo de hace un momento.
  const clipVigente = useRef<ClipVigente>({ modelo: estimacionAnimacion.modelo, producto: productoClip });
  useEffect(() => {
    clipVigente.current = { modelo: estimacionClip.modelo, producto: productoClip };
  }, [estimacionClip.modelo, productoClip]);
  const comprobarClip = (medioId: string, cambio?: Partial<ClipVigente>) =>
    comprobarClipVigente(clipVigente, medioId, controlesClip.refrescar, cambio);
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
  /**
   * El paso de formato solo está en la barra si al abrir había algo que elegir (dos plantillas o más). Se decide una
   * vez: el catálogo se vuelve a pedir al cambiar de modelo y la barra no debe renumerarse a mitad.
   */
  const [conFormato] = useState(() => catalogoClipInicial.plantillas.length >= 2);
  const controlesFoto = useControles(controlesIniciales);
  const controlesClip = useControles(evaluacionPendiente(controlesIniciales.reglasVersion));

  // Sin personaje y sin imagen, la escena sale **solo de la descripción**: otro modelo y otro precio.
  const sinImagen = personajeId === null && imagen.length === 0;
  const modelosDelFotograma = sinImagen ? modelosSinImagen : modelosFotograma;
  const modeloClip = modelosClip.find((m) => m.modelo === estimacionClip.modelo) ?? null;
  const trendElegido = catalogoClip.plantillas.find((p) => p.id === plantillaClip.plantillaId && p.kind === "trend");
  // Formato del clip: elegir un trend puede cambiar el modelo (y volver atrás al quitarlo); ver `use-formato-clip.ts`.
  const formato = useFormatoClip({
    plantillas: catalogoClip.plantillas,
    plantilla: plantillaClip,
    trendElegido,
    modelos: modelosClip,
    modeloActual: modeloClip,
    modeloActualId: estimacionClip.modelo,
    predeterminado: estimacionAnimacion.modelo,
    segundosActuales: segundosDelClip(estimacionClip, modeloClip),
    setPlantilla: setPlantillaClip,
    setEstimacion: setEstimacionClip,
    setError,
    setDialogo,
    alCambiarDeModelo: async (nueva, sigueVigente) => {
      if (sigueVigente()) await refrescarControlesDelClip(fotograma?.medio?.id ?? imagenDelClip?.id, nueva.modelo);
      if (sigueVigente()) await refrescarCatalogo("animacion", nueva.modelo, nueva.segundos ?? undefined);
    },
  });
  // Con un trend, lo que decide él no se envía y no hay modo experto: el servidor aplica la misma regla.
  const direccionAEnviar = trendElegido
    ? eleccionSinLoDecidido({ ...direccionClip, modoExperto: false }, trendElegido.direccionDecidida)
    : direccionClip;
  const clipConVoz = (modeloClip?.conVoz ?? estimacionClip.conVoz) && trendElegido?.trendAllowsSpeech !== false;
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

  // Los mismos bloqueos de siempre, con el campo y el paso al que apunta cada uno; las casillas de cada
  // confirmación viven aquí para poder contarlas.
  const clipPorConfirmar = origenDelClip !== null && animacion === null;
  // Cada gasto tiene sus casillas, y se desmarcan al cambiar de camino, de imagen o (el aviso de gasto) de precio.
  const contextos = contextosDeConfirmacion({
    origen: origenElegido,
    sujetoDelFotograma: personaje?.id ?? referencia?.id,
    selloFotograma: estimacionFoto.sello,
    clipPorConfirmar,
    imagenDelClip: origenDelClip?.id,
    selloClip: estimacionClip.sello,
  });
  const confirmacionFoto = useConfirmacionCoste(contextos.fotograma);
  const confirmacionClip = useConfirmacionCoste(contextos.clip);
  const requisitos = requisitosDeCrear({
    origen: origenElegido,
    fotograma: {
      sinImagen,
      hayModeloSinImagen: modelosSinImagen.length > 0,
      haySujeto: personaje !== null || referencia !== null,
      sinTerceros,
      modeloSinReferencias: personaje !== null && modeloFoto !== null && modeloFoto.maximoReferencias < 1,
      caracteresDescripcion: descripcion.length,
      motivosPlantilla: previaFoto.detalle,
    },
    clip: {
      sinPasoDeEscena: origenElegido === "imagen",
      motivosPlantilla: previaClip.detalle,
      exigeRevision: clipExigeRevision,
      sinTerceros: sinTercerosClip,
      etiquetaDeTexto:
        origenElegido === "imagen" && previaClip.enUso && previaClip.plantilla
          ? (variableDeTexto(previaClip.plantilla.variables)?.etiqueta ?? null)
          : null,
      caracteresDescripcion: descripcion.length,
    },
    frenosFotograma: controlesFoto.bloqueos,
    frenosClip: controlesClip.bloqueos,
    casillasFotograma: confirmacionFoto,
    casillasClip: confirmacionClip,
    conProducto: productoClip.productoId !== "",
    fotogramaSuperaUmbral: estimacionFoto.superaUmbral,
    clipSuperaUmbral: estimacionClip.superaUmbral,
    clipPorConfirmar,
  });

  // Los pasos y su estado salen de lo que hay en pantalla; no se guarda ningún progreso aparte.
  const hayTrends = catalogoClip.plantillas.some((p) => p.kind === "trend");
  const pasos = pasosDeCrear({
    conFormato,
    calculandoFormato: formato.calculando,
    origen: origenElegido,
    haySujeto: personaje !== null || referencia !== null,
    revisionConfirmada: sinTerceros,
    caracteresDescripcion: descripcion.length,
    motivosPlantilla: previaFoto.motivos.length,
    enviandoFotograma: enviando === "fotograma",
    fotograma: fotograma?.estado ?? null,
    imagenDePartida: imagenDelClip !== null,
    hayOrigenDelClip: origenDelClip !== null,
    clip: animacion?.estado ?? null,
    clipsAnteriores: clipsAnteriores.length,
    pendientes: requisitos.pendientes,
  });
  const multipaso = useMultipaso(
    pasos,
    resolverPaso(pasoPedido, pasos, pasoPredeterminadoDeCrear(conFormato, hayTrends)),
  );
  const numero = (id: string) => numeroDePaso(pasos, id);
  // Lo pendiente se enseña siempre arriba y en la barra; el rojo en los campos solo tras salir del paso o intentar avanzar.
  const senales = useRequisitosSenalados(pasos, multipaso);
  const { irAlRequisito } = senales;
  const lugar = useLugarDeCrear(() => void refrescarControles(personajeId, referencia?.id, estimacionFoto.modelo));
  const pasoSenalado = (paso: string) => senales.senalados.includes(paso);

  /**
   * Vuelve a evaluar los controles previos del fotograma con lo que hay elegido ahora. Lo llama la acción que
   * cambia lo evaluado (personaje, imagen o modelo): nunca un efecto.
   */
  const refrescarControles = async (id: string | null, medio: string | undefined, modelo: string) => {
    const fallo = await controlesFoto.refrescar({
      tipo: "fotograma",
      modelo,
      ...(id ? { personajeId: id } : medio ? { medioId: medio } : {}),
      ...lugar.enLaConsulta(),
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
    const fallo = await comprobarClip(medioId, { modelo });
    if (fallo) setError(fallo);
  };

  /** Elegir o quitar el producto cambia lo evaluado: se vuelve a preguntar al servidor para que el aviso salga ya. */
  const elegirProductoDelClip = async (producto: ProductoElegido) => {
    setProductoClip(producto);
    const medioId = fotograma?.medio?.id ?? imagenDelClip?.id;
    if (!medioId) return;
    const fallo = await comprobarClip(medioId, { producto });
    if (fallo) setError(fallo);
  };

  /** Pide el contexto aplicado de un personaje con el modelo que esté elegido. Sin personaje, se limpia. */
  const refrescarContexto = async (id: string | null, modelo: string) => {
    if (!id) return setContexto(null);
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

  /**
   * Genera un fotograma. Con `pasoDigital` es el **segundo paso del producto digital**: se parte del
   * fotograma que ya está hecho y se mete dentro de su pantalla la captura del producto. Es otra generación
   * con otro coste, así que se confirma aparte, como cualquier otro gasto.
   */
  const generarFotograma = async (confirmacion: ConfirmacionCoste, pasoDigital?: "insertar_captura") => {
    // Sin personaje ni imagen también se genera: el servidor usa el gemelo texto a imagen del modelo elegido.
    setEnviando("fotograma");
    setError(null);
    const respuesta = await crearTrabajo({
      tipo: "fotograma",
      // La revisión se envía siempre: una imagen suelta puede ser el resultado de otro trabajo hecho con un
      // personaje, y entonces el servidor la exige igual (hereda ese personaje).
      sinTerceros,
      ...(pasoDigital
        ? // La inserción parte del fotograma que se acaba de ver, no del personaje: lo que se edita es esa imagen.
          { medioId: fotograma?.medio?.id, pasoDigital }
        : personaje
          ? { personajeId: personaje.id }
          : referencia
            ? { medioId: referencia.id }
            : {}),
      /**
       * El producto del clip viaja también con el fotograma: con un producto digital, el fotograma **es** el
       * primer paso (el dispositivo con la pantalla apagada), y con uno físico es donde se ve en la mano.
       */
      producto: { productoId: productoClip.productoId, accion: productoClip.accion },
      ...lugar.enElEnvio,
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
    // Confirmado el gasto, lo siguiente es ver cómo va: se pasa al resultado sin tener que buscarlo.
    multipaso.ir("fotograma");
  };

  const generarAnimacion = async (confirmacion: ConfirmacionCoste) => {
    // El clip sale de un fotograma generado o de una imagen tuya; sin ninguno de los dos no hay nada que animar.
    if ((!fotograma && !imagenDelClip) || formato.calculando) return;
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
      direccion: direccionAEnviar,
      producto: productoClip,
      ...confirmacionDePlantilla(previaClip, plantillaClip),
      ...confirmacion,
    });
    setEnviando(null);
    if (!respuesta.ok) {
      setError(mensajeDeFallo(respuesta));
      if (trendElegido) void refrescarCatalogo("animacion", estimacionClip.modelo, segundosClip);
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
    const segundosDelTrend = trendElegido
      ? segundosParaTrend(trendElegido.duracionesAdmitidas, cobrablesDe(modeloClip), segundosClip)
      : undefined;
    const respuesta = await consultarEstimacion("animacion", estimacionClip.modelo, {
      ...(trendElegido ? { plantillaId: trendElegido.id } : {}),
      ...(segundosDelTrend === undefined ? {} : { segundos: segundosDelTrend }),
    });
    if (respuesta.ok) setEstimacionClip(respuesta.datos);
    // El clip es otro envío: sus controles se evalúan con el fotograma ya generado, que es su referencia.
    const fallo = await comprobarClip(trabajo.medio.id);
    if (fallo) setError(fallo);
  };

  /**
   * Cambiar de modelo cambia el precio, así que se vuelve a pedir la estimación al servidor en lugar de
   * calcularla en el navegador. Si falla, se dice y no se toca la que había: nunca se muestra un coste
   * inventado.
   */
  const elegirModelo = async (tipo: "fotograma" | "animacion", modelo: string, segundos?: number) => {
    setError(null);
    if (tipo === "animacion") formato.olvidarCambio();
    // Al cambiar de modelo con un trend que limita la duración, se pide una que el trend admita y el modelo cobre.
    const limita = tipo === "animacion" && trendElegido && trendElegido.duracionesAdmitidas.length > 0;
    const pedidos =
      segundos === undefined && limita
        ? segundosParaTrend(
            trendElegido.duracionesAdmitidas,
            cobrablesDe(modelosClip.find((m) => m.modelo === modelo) ?? null),
            segundosClip,
          )
        : segundos;
    const respuesta = await consultarEstimacion(tipo, modelo, {
      ...(tipo === "fotograma" ? { sinImagen } : {}),
      ...(pedidos === undefined ? {} : { segundos: pedidos }),
      ...(tipo === "animacion" && trendElegido ? { plantillaId: trendElegido.id } : {}),
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
      // Con fotograma o con imagen propia, el aviso del clip se reevalúa con el modelo nuevo.
      const medioDelClip = fotograma?.medio?.id ?? imagenDelClip?.id;
      if (medioDelClip) await comprobarClip(medioDelClip, { modelo: respuesta.datos.modelo });
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

  const accionesDePreset = (tipo: "fotograma" | "animacion") => (preset: PresetVisible) => (
    <DialogoPresetPropio
      key={preset.id}
      preset={preset}
      deshabilitado={enviando !== null}
      onGuardado={() =>
        void refrescarCatalogo(tipo, tipo === "fotograma" ? estimacionFoto.modelo : estimacionClip.modelo)
      }
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <DepositoPresupuesto deposito={deposito} cola={cola} />

      <Multipaso etiqueta="Pasos para crear" pasos={pasos} control={senales.controlConSenales}>
        {error && <Aviso tono="error">{error}</Aviso>}

        {/* El formato va primero: un trend decide la duración (y su tarifa) y si se habla a cámara. */}
        {conFormato && (
          <PanelDePaso id="formato">
            <PasoFormato
              numero={numero("formato")}
              catalogo={catalogoClip}
              plantillaId={plantillaClip.plantillaId}
              trend={trendElegido ?? null}
              calculando={formato.calculando}
              deshabilitado={enviando === "animacion"}
              avisoModelo={formato.avisoModelo}
              // Cambiar de plantilla cambia qué variables hay: la selección deja de valer.
              onPlantilla={(plantillaId) => void formato.elegir({ plantillaId, seleccion: {} })}
            />
          </PanelDePaso>
        )}

        {/*
          Dos caminos, y se eligen antes que nada: generar un fotograma nuevo o traer una imagen que ya tienes.
          Con una imagen tuya **no hay fotograma que generar**, así que esos pasos desaparecen de la barra:
          ni formulario, ni plantilla, ni estimación de algo que no se va a pedir.
        */}
        <PanelDePaso id="origen">
          <PasoOrigen
            numero={numero("origen")}
            origen={origenElegido}
            deshabilitado={enviando !== null || fotograma !== null || animacion !== null}
            onOrigen={elegirOrigen}
          />
        </PanelDePaso>

        {origenElegido === "imagen" && (
          <PanelDePaso id="imagen">
            <PasoImagenDePartida
              numero={numero("imagen")}
              imagen={imagenDeBiblioteca}
              onImagen={(medios) => {
                setImagenDeBiblioteca(medios);
                setSinTercerosClip(false);
                void refrescarControlesDelClip(medios[0]?.id, estimacionClip.modelo);
              }}
            />
          </PanelDePaso>
        )}

        {origenElegido === "fotograma" && (
          <>
            <PanelDePaso id="sujeto">
              <PasoSujeto
                numero={numero("sujeto")}
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
                requisitos={senales.marcados(requisitos.fotogramaBase)}
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
            </PanelDePaso>

            <PanelDePaso id="escena">
              <PasoEscena
                numero={numero("escena")}
                prompt={prompt}
                dialogo={dialogo}
                conVoz={clipConVoz}
                catalogo={catalogoFoto}
                plantilla={plantillaFoto}
                previa={previaFoto}
                requisitos={senales.marcados(requisitos.fotogramaBase)}
                deshabilitado={enviando !== null}
                accionesDePreset={accionesDePreset("fotograma")}
                lugar={lugar.lugar}
                onLugar={lugar.elegir}
                onPrompt={setPrompt}
                onDialogo={setDialogo}
                onPlantilla={setPlantillaFoto}
                onDuplicar={(preset) => void duplicar("fotograma", preset)}
              />
            </PanelDePaso>

            <PanelDePaso id="coste">
              <PasoCosteFotograma
                numero={numero("coste")}
                personaje={personaje}
                contexto={contexto}
                pidiendoContexto={pidiendoContexto}
                controles={controlesFoto}
                estimacion={estimacionFoto}
                conProducto={productoClip.productoId !== ""}
                firma={`fotograma|${personaje?.id ?? ""}|${contexto?.personajeId === personaje?.id ? contexto?.versionId : ""}|${referencia?.id ?? ""}|${descripcion}|${estimacionFoto.modelo}|${estimacionFoto.sello}|${firmaDePlantilla(previaFoto, plantillaFoto)}`}
                bloqueos={requisitos.fotogramaBase}
                requisitos={requisitos.fotograma}
                confirmacion={confirmacionFoto}
                marcar={pasoSenalado("coste")}
                enviando={enviando === "fotograma"}
                onIrARequisito={irAlRequisito}
                onGenerar={generarFotograma}
              />
            </PanelDePaso>

            <PanelDePaso id="fotograma">
              {fotograma && (
                <PasoResultadoFotograma
                  numero={numero("fotograma")}
                  fotograma={fotograma}
                  productoId={productoClip.productoId}
                  consultaInsercion={{ accion: productoClip.accion, lugarId: lugar.lugar.lugarId }}
                  controles={controlesFoto}
                  estimacion={estimacionFoto}
                  enviando={enviando === "fotograma"}
                  onCambio={alCambiarFotograma}
                  onInsertarCaptura={(confirmacion) => void generarFotograma(confirmacion, "insertar_captura")}
                />
              )}
            </PanelDePaso>
          </>
        )}

        {/*
          El clip es su propio paso desde la 0.25.1: se puede llegar a él sin generar ningún fotograma, trayendo una
          imagen tuya. Su coste se confirma aparte, como siempre.
        */}
        <PanelDePaso id="clip">
          <PasoClip
            numero={numero("clip")}
            origen={origenDelClip}
            proporcionDelFotograma={fotograma?.medio ? fotograma.proporcion : null}
            modelos={modelosClip}
            estimacion={estimacionClip}
            conVoz={clipConVoz}
            segundos={segundosClip}
            dialogo={dialogo}
            opcionesDireccion={opcionesDireccion}
            direccion={direccionClip}
            producto={productoClip}
            onProducto={elegirProductoDelClip}
            catalogo={catalogoClip}
            plantilla={plantillaClip}
            previa={previaClip}
            requisitosBase={senales.marcados(requisitos.clipBase)}
            requisitos={requisitos.clip}
            avisoModelo={formato.avisoModelo}
            trend={trendElegido ?? null}
            descripcion={prompt}
            conCampoDeTexto={origenElegido === "imagen"}
            confirmacion={confirmacionClip}
            marcar={pasoSenalado("clip")}
            controles={controlesClip}
            exigeRevision={clipExigeRevision}
            sinTerceros={sinTercerosClip}
            enviando={enviando === "animacion" || formato.calculando}
            firma={`animacion|${fotograma?.id ?? ""}|${imagenDelClip?.id ?? ""}|${intentoClip}|${descripcion}|${frase}|${JSON.stringify(direccionAEnviar)}|${JSON.stringify(productoClip)}|${estimacionClip.modelo}|${segundosClip}|${estimacionClip.sello}|${firmaDePlantilla(previaClip, plantillaClip)}`}
            clipEnMarcha={animacion}
            clipsAnteriores={clipsAnteriores}
            accionesDePreset={accionesDePreset("animacion")}
            onModelo={(modelo) => elegirModelo("animacion", modelo)}
            onDuracion={(segundos) => void elegirModelo("animacion", estimacionClip.modelo, segundos)}
            onDialogo={setDialogo}
            onDescripcion={setPrompt}
            onIrARequisito={irAlRequisito}
            onDireccion={(campo, valor) => setDireccionClip((antes) => ({ ...antes, [campo]: valor }))}
            onPlantilla={(estado) => void formato.elegir(estado)}
            onDuplicar={(preset) => void duplicar("animacion", preset)}
            onSinTerceros={setSinTercerosClip}
            onGenerar={generarAnimacion}
            onCambioClip={setAnimacion}
            onOtroClip={otroClip}
          />
        </PanelDePaso>
      </Multipaso>
    </div>
  );
}
