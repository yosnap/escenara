"use client";

import { Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Boton, claseBoton } from "@/components/ui/button";
import { AnilloHistoria } from "@/components/ui/creator";
import { Aviso, AvisoEstado } from "@/components/ui/feedback";
import { Pestanas } from "@/components/ui/overlay";
import { anilloDeEstado, InsigniaEstadoPersonaje } from "@/components/ui/personaje";
import {
  anadirImagenesGeneradas,
  anadirReferencias,
  asignarVistasDeReferencias,
  comprobarIdentidadDeReferencia,
  ordenarReferencias,
  quitarReferencias,
  type Resultado,
  registrarConsentimiento,
  revocarConsentimiento,
} from "@/components/ui/personajes/api-personajes";
import type { EstadoConsentimiento } from "@/components/ui/personajes/formulario-consentimiento";
import { ETIQUETA_VISTA, type UmbralesCalidad, type Vista } from "@/lib/captura-personaje";
import type { Medio } from "@/lib/media/tipos";
import {
  ETIQUETA_TIPO_PERSONAJE,
  exigeDocumento,
  type PersonajeVista,
  type ReferenciasAnadidas,
} from "@/lib/personajes";
import { DialogoBorrarPersonaje } from "./dialogo-borrar-personaje";
import { type EstadoDeClave, PanelCobertura } from "./panel-cobertura";
import { PanelConsentimiento } from "./panel-consentimiento";
import { PanelFicha } from "./panel-ficha";
import { PanelOmni, type ProyectoOmni } from "./panel-omni";
import { PanelReferencias, type ResultadoAnadir } from "./panel-referencias";
import { PanelRetratos } from "./panel-retratos";
import { PanelVersiones } from "./panel-versiones";
import { PasosInventado } from "./pasos-inventado";

/**
 * Ficha de un personaje: su estado con lo que le falta, sus fotos de referencia, su consentimiento y el
 * borrado con su diálogo propio.
 *
 * Toda operación devuelve el personaje recalculado por el servidor, así que el estado que se ve después es el
 * de verdad y no una suposición del navegador.
 */
export function FichaPersonaje({
  inicial,
  umbrales,
  claveDeGeneracion,
  retratos,
  proyectosOmni,
}: {
  inicial: PersonajeVista;
  umbrales: UmbralesCalidad;
  /** Retratos candidatos de un personaje inventado, resueltos por la página; vacío en los demás. */
  retratos: Medio[];
  /** Proyectos suyos en modo Omni, para poder registrarlo con la voz de uno de ellos (0.22.0). */
  proyectosOmni: ProyectoOmni[];
  /** Si se puede generar con la clave del usuario, y si no, por qué: lo decide el servidor en la página. */
  claveDeGeneracion: EstadoDeClave;
}) {
  const router = useRouter();
  const [personaje, setPersonaje] = useState(inicial);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [vistaEncolada, setVistaEncolada] = useState<string | null>(null);

  /** Aplica una operación y deja el personaje que devuelve el servidor. Devuelve el error, o `null`. */
  const aplicar = async (accion: Promise<Resultado<ReferenciasAnadidas>>): Promise<string | null> => {
    setOcupado(true);
    setError(null);
    const respuesta = await accion;
    setOcupado(false);
    if (!respuesta.ok) {
      setError(respuesta.error);
      return respuesta.error;
    }
    setPersonaje(respuesta.datos);
    router.refresh();
    return null;
  };

  const cambiarReferencias = (accion: "quitar" | "ordenar", ids: string[]) =>
    accion === "quitar"
      ? aplicar(quitarReferencias(personaje.id, ids))
      : aplicar(ordenarReferencias(personaje.id, ids));

  /**
   * Añade fotos de la biblioteca y devuelve **también los rechazos**: es lo que permite enseñar por qué una foto
   * se ha quedado fuera y ofrecer usarla de todas formas, en vez de un error suelto sin salida.
   *
   * Un rechazo no se pinta como error rojo arriba: lo cuenta el panel de las fotos, con su miniatura y su acción.
   */
  const anadirFotos = async (medioIds: string[], deTodasFormas: string[] = []): Promise<ResultadoAnadir> => {
    setOcupado(true);
    setError(null);
    // En un inventado solo entran imágenes generadas con IA, con su declaración (la pide el panel).
    const respuesta = personaje.inventado
      ? await anadirImagenesGeneradas(personaje.id, medioIds)
      : await anadirReferencias(personaje.id, medioIds, deTodasFormas);
    setOcupado(false);
    if (!respuesta.ok) {
      const rechazos = respuesta.rechazos ?? [];
      if (rechazos.length === 0) setError(respuesta.error);
      return { error: respuesta.error, rechazos };
    }
    setPersonaje(respuesta.datos);
    router.refresh();
    return { error: null, rechazos: respuesta.datos.rechazos ?? [] };
  };

  /** Dice qué vista es una foto que ya está en el personaje. `null` la deja sin clasificar. */
  const cambiarVista = (referenciaId: string, vista: Vista | null) =>
    void aplicar(asignarVistasDeReferencias(personaje.id, [{ id: referenciaId, vistaClave: vista }]));

  /**
   * Comprueba el parecido de una vista generada. Si **no** se ha podido comprobar, se enseña el motivo arriba: es
   * información (falta la autorización, falta un servicio que vea, Jev no contestó), no un fallo silencioso.
   */
  const comprobarParecido = async (referenciaId: string) => {
    setOcupado(true);
    setError(null);
    const respuesta = await comprobarIdentidadDeReferencia(personaje.id, referenciaId);
    setOcupado(false);
    if (!respuesta.ok) {
      setError(respuesta.error);
      return;
    }
    if (!respuesta.datos.comprobada) setError(respuesta.datos.motivo);
    setPersonaje(respuesta.datos.personaje);
    router.refresh();
  };

  const registrar = (estado: EstadoConsentimiento) =>
    aplicar(
      registrarConsentimiento(personaje.id, {
        titular: estado.titular,
        mayoriaDeEdad: estado.mayoriaDeEdad,
        coherencia: estado.coherencia,
        alcance: estado.alcance,
        ...(exigeDocumento(estado.titular) && estado.documento[0] ? { documentoId: estado.documento[0].id } : {}),
      }),
    );

  return (
    <div className="flex flex-col gap-8">
      {!personaje.puedeEditar && (
        <Aviso tono="info">
          Estás viendo este personaje como quien administra la instalación, para revisar su consentimiento. No puedes
          editarlo ni borrarlo, y sus fotos de referencia no se muestran: lo que se revisa es el documento, no la cara
          de nadie. Este acceso queda registrado.
        </Aviso>
      )}

      <header className="flex flex-wrap items-start gap-5">
        {/* Sin pie: el nombre y el estado están justo al lado, y repetirlos debajo del avatar es leer lo mismo
            dos veces. El anillo conserva su color y la insignia de al lado, su icono y su texto. */}
        <AnilloHistoria
          nombre={personaje.nombre}
          imagen={personaje.portada?.url}
          estado={anilloDeEstado(personaje.estado)}
          tamano={96}
          conPie={false}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h1 className="text-4xl font-bold text-texto">{personaje.nombre}</h1>
          <p className="text-texto-suave">
            {ETIQUETA_TIPO_PERSONAJE[personaje.tipo]}
            {personaje.especie && ` · ${personaje.especie}`}
          </p>
          <InsigniaEstadoPersonaje estado={personaje.estado} className="self-start" />
          {personaje.descripcion && <p className="whitespace-pre-line text-texto">{personaje.descripcion}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {personaje.puedeEditar && personaje.puedeGenerar && (
            <Link href={`/crear?personaje=${personaje.id}`} className={claseBoton("chispa", "sm")}>
              <Sparkles className="size-4" aria-hidden /> Generar con él
            </Link>
          )}
          {personaje.puedeEditar && (
            <Boton
              variante="secundario"
              tamano="sm"
              icono={<Trash2 className="size-4" />}
              onClick={() => setBorrando(true)}
            >
              Borrar
            </Boton>
          )}
        </div>
      </header>

      {personaje.impedimentos.length > 0 && (
        <AvisoEstado
          estado={
            personaje.estado === "bloqueado" ? "bloqueado" : personaje.estado === "en_revision" ? "revision" : "ajustes"
          }
          motivo={
            <span className="flex flex-col gap-1">
              {personaje.impedimentos.map((motivo) => (
                <span key={motivo}>{motivo}</span>
              ))}
            </span>
          }
        />
      )}

      {/* En un inventado, la guía va antes que las pestañas: recién creado, es lo único que hay que leer. */}
      {personaje.inventado && personaje.puedeEditar && (
        <PasosInventado personaje={personaje} retratos={retratos.length} />
      )}

      {error && <Aviso tono="error">{error}</Aviso>}

      {vistaEncolada && (
        <Aviso tono="info">
          La vista «{vistaEncolada}» se está generando. Cuando termine aparecerá aquí como{" "}
          <strong className="font-semibold">vista generada</strong>, etiquetada y sin contar como foto original. Puedes
          seguir el trabajo en{" "}
          <Link href="/crear/historial" className="font-semibold underline">
            el historial
          </Link>
          , y recargar esta ficha cuando esté listo.
        </Aviso>
      )}

      {/* Tres pestañas del catálogo: la ficha (contexto de generación), las referencias con su cobertura y el
          historial de versiones. El consentimiento queda fuera de las pestañas a propósito: es la puerta que
          decide si se puede generar y tiene que verse siempre, no escondido detrás de una pestaña. */}
      {personaje.puedeEditar ? (
        <Pestanas
          pestanas={[
            {
              valor: "ficha",
              etiqueta: "Ficha",
              contenido: (
                <PanelFicha
                  personaje={personaje}
                  onPersonaje={(actualizado) => {
                    setPersonaje(actualizado);
                    router.refresh();
                  }}
                />
              ),
            },
            {
              valor: "referencias",
              etiqueta: personaje.inventado ? "Retratos y vistas" : "Referencias",
              contenido: (
                <div className="flex flex-col gap-8">
                  {/* Un personaje inventado no sube fotos: su cara sale de aquí, y las vistas, del retrato. */}
                  {personaje.inventado && (
                    <PanelRetratos
                      personaje={personaje}
                      medios={retratos}
                      onPersonaje={(actualizado) => {
                        setPersonaje(actualizado);
                        router.refresh();
                      }}
                    />
                  )}
                  <PanelCobertura
                    personaje={personaje}
                    umbrales={umbrales}
                    claveDeGeneracion={claveDeGeneracion}
                    onPersonaje={(actualizado) => {
                      setPersonaje(actualizado);
                      router.refresh();
                    }}
                    onVistaEncolada={(vista) => setVistaEncolada(ETIQUETA_VISTA[vista])}
                  />
                  {/* En un personaje inventado solo se añaden imágenes generadas con IA, con su declaración. */}
                  <PanelReferencias
                    personaje={personaje}
                    onCambio={cambiarReferencias}
                    onAnadir={anadirFotos}
                    onVista={cambiarVista}
                    onIdentidad={(referenciaId) => void comprobarParecido(referenciaId)}
                    ocupado={ocupado}
                  />
                </div>
              ),
            },
            {
              valor: "habladas",
              etiqueta: "Escenas habladas",
              contenido: (
                <PanelOmni
                  personaje={personaje}
                  proyectos={proyectosOmni}
                  onPersonaje={(actualizado) => {
                    setPersonaje(actualizado);
                    router.refresh();
                  }}
                />
              ),
            },
            {
              valor: "versiones",
              etiqueta: "Versiones",
              contenido: <PanelVersiones personaje={personaje} onPersonaje={setPersonaje} />,
            },
          ]}
        />
      ) : null}

      <PanelConsentimiento
        personaje={personaje}
        onRegistrar={registrar}
        onRevocar={(motivo) => aplicar(revocarConsentimiento(personaje.id, motivo))}
        ocupado={ocupado}
        soloLectura={!personaje.puedeEditar}
      />

      {personaje.puedeEditar && (
        <DialogoBorrarPersonaje
          id={personaje.id}
          nombre={personaje.nombre}
          abierto={borrando}
          onAbiertoCambio={setBorrando}
          onBorrado={() => router.push("/personajes")}
        />
      )}
    </div>
  );
}
