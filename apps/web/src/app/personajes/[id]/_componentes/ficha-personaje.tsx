"use client";

import { Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Boton, claseBoton } from "@/components/ui/button";
import { AnilloHistoria } from "@/components/ui/creator";
import { Aviso, AvisoEstado } from "@/components/ui/feedback";
import { anilloDeEstado, InsigniaEstadoPersonaje } from "@/components/ui/personaje";
import {
  anadirReferencias,
  ordenarReferencias,
  quitarReferencias,
  type Resultado,
  registrarConsentimiento,
  revocarConsentimiento,
} from "@/components/ui/personajes/api-personajes";
import type { EstadoConsentimiento } from "@/components/ui/personajes/formulario-consentimiento";
import { ETIQUETA_TIPO_PERSONAJE, exigeDocumento, type PersonajeVista } from "@/lib/personajes";
import { DialogoBorrarPersonaje } from "./dialogo-borrar-personaje";
import { PanelConsentimiento } from "./panel-consentimiento";
import { PanelReferencias } from "./panel-referencias";

/**
 * Ficha de un personaje: su estado con lo que le falta, sus fotos de referencia, su consentimiento y el
 * borrado con su diálogo propio.
 *
 * Toda operación devuelve el personaje recalculado por el servidor, así que el estado que se ve después es el
 * de verdad y no una suposición del navegador.
 */
export function FichaPersonaje({ inicial }: { inicial: PersonajeVista }) {
  const router = useRouter();
  const [personaje, setPersonaje] = useState(inicial);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [borrando, setBorrando] = useState(false);

  /** Aplica una operación y deja el personaje que devuelve el servidor. Devuelve el error, o `null`. */
  const aplicar = async (accion: Promise<Resultado<PersonajeVista>>): Promise<string | null> => {
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

  const cambiarReferencias = (accion: "anadir" | "quitar" | "ordenar", ids: string[]) => {
    if (accion === "anadir") return aplicar(anadirReferencias(personaje.id, ids));
    if (accion === "quitar") return aplicar(quitarReferencias(personaje.id, ids));
    return aplicar(ordenarReferencias(personaje.id, ids));
  };

  const registrar = (estado: EstadoConsentimiento) =>
    aplicar(
      registrarConsentimiento(personaje.id, {
        titular: estado.titular,
        mayoriaDeEdad: estado.mayoriaDeEdad,
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
        <AnilloHistoria
          nombre={personaje.nombre}
          imagen={personaje.portada?.url}
          estado={anilloDeEstado(personaje.estado)}
          tamano={96}
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

      {error && <Aviso tono="error">{error}</Aviso>}

      {personaje.puedeEditar && (
        <PanelReferencias personaje={personaje} onCambio={cambiarReferencias} ocupado={ocupado} />
      )}

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
