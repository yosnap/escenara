"use client";

import { Camera, RefreshCw, SwitchCamera, Upload } from "lucide-react";
import { useCallback, useState } from "react";
import type { RechazoDeReferencia } from "@/lib/captura-personaje";
import {
  ACCION_MOTIVO,
  ETIQUETA_MOTIVO,
  ETIQUETA_VISTA,
  evaluarCalidad,
  INDICACION_VISTA,
  type MetricasCalidad,
  type MotivoRechazo,
  midaCara,
  RELACION_VISTA,
  type UmbralesCalidad,
  type VeredictoCalidad,
  type Vista,
} from "@/lib/captura-personaje";
import type { Medio } from "@/lib/media/tipos";
import type { PersonajeVista, TipoPersonaje } from "@/lib/personajes";
import { Boton } from "../button";
import { Aviso } from "../feedback";
import { subirMedio } from "../media/api-medios";
import { hayDetectorDeCaras, medirEnNavegador } from "./analisis-navegador";
import { anadirReferenciasGuiadas } from "./api-personajes";
import { MarcoEnfoque } from "./marco-enfoque";

/**
 * Captura guiada de una vista concreta (RF03): la cámara con el marco «Enfoque» y la silueta de la vista
 * pendiente, o la subida de un archivo para quien no da permiso de cámara (o no la tiene).
 *
 * Lo que la hace «guiada» es que **antes de subir nada** se mide la foto en el navegador con los mismos
 * umbrales que aplica el servidor: si está borrosa, oscura o pequeña, se dice con la acción concreta para
 * arreglarlo y se puede repetir sin haber ocupado cuota. El servidor vuelve a medirla igual: lo que decide es
 * él, así que aquí no hay ninguna puerta que se pueda saltar desde el navegador.
 *
 * Todo funciona con teclado: son botones y un campo de archivo normales, sin gestos ni arrastres obligatorios.
 */

/** Lado mayor que se le pide a la cámara. Con menos, el recorte se queda corto de resolución. */
const LADO_CAMARA = 1440;

type Fase = "inicio" | "camara" | "revision";

interface FotoTomada {
  archivo: File;
  url: string;
  /** `null` cuando este navegador no ha podido leer los píxeles: entonces solo mide el servidor. */
  metricas: MetricasCalidad | null;
  veredicto: VeredictoCalidad | null;
  /** Medio ya subido a la biblioteca, si la subida se hizo y el servidor lo rechazó como referencia. */
  medio: Medio | null;
  /** Rechazo que devolvió el servidor, si lo hubo. */
  rechazo: RechazoDeReferencia | null;
}

export function VisorCaptura({
  personajeId,
  tipo,
  vista,
  umbrales,
  onAnadida,
}: {
  personajeId: string;
  /** Persona o animal: decide si se mide el tamaño de la cara. */
  tipo: TipoPersonaje;
  vista: Vista;
  umbrales: UmbralesCalidad;
  /** Se llama con el personaje que devuelve el servidor cuando la referencia ya está guardada. */
  onAnadida: (personaje: PersonajeVista) => void;
}) {
  const [fase, setFase] = useState<Fase>("inicio");
  const [flujo, setFlujo] = useState<MediaStream | null>(null);
  /** Elemento de vídeo montado, guardado al conectarlo: es de donde sale el fotograma al disparar. */
  const [visor, setVisor] = useState<HTMLVideoElement | null>(null);
  const [frontal, setFrontal] = useState(true);
  const [foto, setFoto] = useState<FotoTomada | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  /**
   * Conecta el flujo al vídeo y **lo apaga al desmontarlo o al cambiar de cámara**: la cámara encendida de un
   * visor que ya no está a la vista es exactamente lo que nadie quiere en su ordenador.
   */
  const montarVideo = useCallback(
    (el: HTMLVideoElement | null) => {
      if (!el || !flujo) return;
      el.srcObject = flujo;
      setVisor(el);
      void el.play().catch(() => setError("El navegador no ha querido reproducir la imagen de la cámara."));
      return () => {
        el.srcObject = null;
        setVisor(null);
        for (const pista of flujo.getTracks()) pista.stop();
      };
    },
    [flujo],
  );

  const apagarCamara = () => {
    setFlujo(null);
    setFase("inicio");
  };

  const encenderCamara = async (usarFrontal = frontal) => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Este navegador no da acceso a la cámara. Sube una foto desde tu equipo.");
      return;
    }
    // La cámara que hubiera se apaga **antes** de pedir la otra: en un móvil, las dos a la vez no siempre se
    // pueden abrir, y el aviso de «cámara en uso» del navegador se quedaría encendido hasta el siguiente
    // repintado.
    for (const pista of flujo?.getTracks() ?? []) pista.stop();
    setFlujo(null);
    try {
      const nuevo = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: usarFrontal ? "user" : "environment",
          width: { ideal: LADO_CAMARA },
          height: { ideal: LADO_CAMARA },
        },
        audio: false,
      });
      setFrontal(usarFrontal);
      // El flujo anterior lo apaga la limpieza del `ref` al cambiar de flujo.
      setFlujo(nuevo);
      setFase("camara");
    } catch {
      setError(
        "No hay permiso de cámara (o no hay cámara disponible). Puedes subir una foto desde tu equipo: la guía es la misma.",
      );
    }
  };

  /** Mide la fuente y deja la foto en revisión. El recorte ya viene hecho por quien llama. */
  const revisar = async (archivo: File, fuente: HTMLCanvasElement | HTMLImageElement) => {
    const metricas = await medirEnNavegador(fuente, { medirCara: midaCara(vista, tipo) });
    if (!metricas) {
      setError("No se ha podido medir la foto en este navegador. Puedes subirla igualmente: la medirá el servidor.");
    }
    setFoto({
      archivo,
      url: URL.createObjectURL(archivo),
      metricas,
      // Sin medidas no se inventa un veredicto: se sube y decide el servidor, que mide igual.
      veredicto: metricas ? evaluarCalidad(metricas, umbrales) : null,
      medio: null,
      rechazo: null,
    });
    setFase("revision");
  };

  /** Toma el fotograma actual del visor, lo recorta a la proporción de la vista y lo mide. */
  const disparar = async () => {
    const video = visor;
    const ancho = video?.videoWidth ?? 0;
    const alto = video?.videoHeight ?? 0;
    if (!video || ancho === 0 || alto === 0) {
      setError("La cámara todavía no está lista: espera un segundo y vuelve a intentarlo.");
      return;
    }
    const proporcion = RELACION_VISTA[vista] === "vertical" ? 3 / 4 : 1;
    const anchoRecorte = Math.min(ancho, alto * proporcion);
    const altoRecorte = anchoRecorte / proporcion;
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(anchoRecorte);
    lienzo.height = Math.round(altoRecorte);
    const contexto = lienzo.getContext("2d");
    if (!contexto) {
      setError("Este navegador no sabe recortar la foto. Sube una desde tu equipo.");
      return;
    }
    contexto.drawImage(
      video,
      Math.round((ancho - anchoRecorte) / 2),
      Math.round((alto - altoRecorte) / 2),
      Math.round(anchoRecorte),
      Math.round(altoRecorte),
      0,
      0,
      lienzo.width,
      lienzo.height,
    );
    const blob = await new Promise<Blob | null>((listo) => lienzo.toBlob(listo, "image/jpeg", 0.95));
    if (!blob) {
      setError("No se ha podido guardar la foto del visor. Vuelve a intentarlo.");
      return;
    }
    apagarCamara();
    await revisar(new File([blob], `${vista}-${Date.now()}.jpg`, { type: "image/jpeg" }), lienzo);
  };

  /** Sube la foto a la biblioteca y la añade como referencia de esta vista. */
  const guardar = async (usarDeTodasFormas: boolean) => {
    if (!foto) return;
    setOcupado(true);
    setError(null);
    // Si ya se subió en un intento anterior, se reutiliza: subirla otra vez gastaría cuota por nada.
    let medio = foto.medio;
    if (!medio) {
      const subida = await subirMedio(foto.archivo, {}, undefined, ["imagen"]);
      if (!subida.ok) {
        setOcupado(false);
        setError(subida.error);
        return;
      }
      medio = subida.datos;
      setFoto({ ...foto, medio });
    }
    const respuesta = await anadirReferenciasGuiadas(personajeId, [
      {
        medioId: medio.id,
        vistaClave: vista,
        ...(foto.metricas?.caraRelativa != null ? { caraRelativa: foto.metricas.caraRelativa } : {}),
        ...(usarDeTodasFormas ? { usarDeTodasFormas: true } : {}),
      },
    ]);
    setOcupado(false);
    if (!respuesta.ok) {
      setError(respuesta.error);
      setFoto((actual) => (actual ? { ...actual, medio, rechazo: respuesta.rechazos?.[0] ?? null } : actual));
      return;
    }
    URL.revokeObjectURL(foto.url);
    setFoto(null);
    setFase("inicio");
    onAnadida(respuesta.datos);
  };

  const elegirArchivo = async (archivo: File | undefined) => {
    if (!archivo) return;
    setError(null);
    const url = URL.createObjectURL(archivo);
    const imagen = new Image();
    imagen.src = url;
    try {
      // Sin `useEffect`: se espera a que la imagen esté cargada y se mide ahí mismo.
      await imagen.decode();
      await revisar(archivo, imagen);
    } catch {
      setError("No se ha podido leer esa imagen. Prueba con un JPEG o un PNG.");
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const motivos: MotivoRechazo[] = foto?.rechazo?.motivos ?? foto?.veredicto?.motivos ?? [];
  const bloqueante = foto?.rechazo?.bloqueante ?? foto?.veredicto?.bloqueante ?? false;

  return (
    <section aria-label={`Captura de ${ETIQUETA_VISTA[vista].toLowerCase()}`} className="flex flex-col gap-4">
      {error && <Aviso tono="error">{error}</Aviso>}

      {fase === "revision" && foto ? (
        <>
          <MarcoEnfoque vista={vista} etiqueta={INDICACION_VISTA[vista]}>
            {/* Es la foto que acaba de hacer el usuario, todavía en su navegador. */}
            {/* biome-ignore lint/performance/noImgElement: blob local del navegador, sin optimizador de Next */}
            <img src={foto.url} alt="Foto que acabas de hacer" className="size-full object-cover" />
          </MarcoEnfoque>
          {foto.metricas && <MedidasFoto metricas={foto.metricas} />}
          {motivos.length > 0 ? (
            <div className="flex flex-col gap-3 rounded-tarjeta border-2 border-aviso/45 bg-superficie p-4">
              <h4 className="font-bold text-texto">
                {bloqueante ? "Esta foto no sirve como referencia" : "Esta foto se puede mejorar"}
              </h4>
              <ul className="flex flex-col gap-2">
                {motivos.map((motivo) => (
                  <li key={motivo} className="text-sm text-texto">
                    <strong className="font-semibold">{ETIQUETA_MOTIVO[motivo]}:</strong> {ACCION_MOTIVO[motivo]}
                  </li>
                ))}
              </ul>
              {foto.medio && (
                <p className="text-sm text-texto-suave">
                  La foto ya está subida a tu biblioteca, aunque no se haya añadido al personaje: si no la quieres,
                  bórrala desde allí.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Boton
                  variante="secundario"
                  icono={<RefreshCw className="size-4" />}
                  disabled={ocupado}
                  onClick={() => {
                    URL.revokeObjectURL(foto.url);
                    setFoto(null);
                    setFase("inicio");
                  }}
                >
                  Hacer otra
                </Boton>
                {!bloqueante && (
                  <Boton variante="fantasma" cargando={ocupado} onClick={() => void guardar(true)}>
                    Usarla de todas formas
                  </Boton>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Boton cargando={ocupado} onClick={() => void guardar(false)}>
                Usar esta foto
              </Boton>
              <Boton
                variante="secundario"
                icono={<RefreshCw className="size-4" />}
                disabled={ocupado}
                onClick={() => {
                  URL.revokeObjectURL(foto.url);
                  setFoto(null);
                  setFase("inicio");
                }}
              >
                Hacer otra
              </Boton>
            </div>
          )}
        </>
      ) : (
        <>
          <MarcoEnfoque vista={vista} etiqueta={INDICACION_VISTA[vista]}>
            {flujo ? (
              // El espejo solo con la cámara frontal: verse al revés hace imposible colocarse.
              <video
                ref={montarVideo}
                muted
                playsInline
                aria-label="Imagen de la cámara"
                className={`size-full object-cover ${frontal ? "scale-x-[-1]" : ""}`}
              />
            ) : (
              <p className="flex size-full items-center justify-center p-6 text-center text-sm text-texto-suave">
                Enciende la cámara o sube una foto: la guía es la misma.
              </p>
            )}
          </MarcoEnfoque>

          <div className="flex flex-wrap gap-2">
            {fase === "camara" && flujo ? (
              <>
                <Boton icono={<Camera className="size-4" />} onClick={() => void disparar()}>
                  Hacer la foto
                </Boton>
                <Boton
                  variante="secundario"
                  icono={<SwitchCamera className="size-4" />}
                  onClick={() => void encenderCamara(!frontal)}
                >
                  Cambiar de cámara
                </Boton>
                <Boton variante="fantasma" onClick={apagarCamara}>
                  Apagar la cámara
                </Boton>
              </>
            ) : (
              <Boton icono={<Camera className="size-4" />} onClick={() => void encenderCamara()}>
                Encender la cámara
              </Boton>
            )}
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control border border-borde bg-superficie px-5 text-base font-semibold text-texto hover:bg-elevada focus-within:outline-2 focus-within:outline-acento focus-within:outline-offset-2">
              <Upload className="size-4" aria-hidden />
              Subir una foto
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  const archivo = e.target.files?.[0];
                  e.target.value = "";
                  void elegirArchivo(archivo);
                }}
              />
            </label>
          </div>

          {midaCara(vista, tipo) && !hayDetectorDeCaras() && (
            <p className="text-sm text-texto-suave">
              Este navegador no sabe detectar caras, así que no se comprueba si la cara sale pequeña. Sí se comprueban
              el tamaño, el enfoque y la luz.
            </p>
          )}
        </>
      )}
    </section>
  );
}

/** Las medidas de la foto, en claro: sin ellas, «borrosa» es una opinión. */
function MedidasFoto({ metricas }: { metricas: MetricasCalidad }) {
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {/* El tamaño que importa es el que va a quedar guardado, no el del archivo original. */}
      <Medida etiqueta="Tamaño al guardar" valor={`${metricas.ancho} × ${metricas.alto}`} />
      <Medida etiqueta="Enfoque" valor={Number.isFinite(metricas.nitidez) ? metricas.nitidez.toFixed(1) : "—"} />
      <Medida etiqueta="Luz" valor={metricas.luminosidad.toFixed(0)} />
      <Medida
        etiqueta="Cara"
        valor={metricas.caraRelativa === null ? "Sin medir" : `${Math.round(metricas.caraRelativa * 100)} %`}
      />
    </dl>
  );
}

function Medida({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="rounded-control bg-elevada px-3 py-2">
      <dt className="text-xs text-texto-suave">{etiqueta}</dt>
      <dd className="font-mono text-sm font-semibold text-texto">{valor}</dd>
    </div>
  );
}
