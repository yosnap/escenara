"use client";

import { BookmarkPlus, Pencil, Trash2, Wand2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  aplicarDireccionGuardada,
  type DireccionElegidaConAcento,
  type DireccionGuardada,
  NOMBRE_DIRECCION_MAXIMO,
  type OpcionesDeDireccion,
} from "@/lib/direccion";
import { Boton, BotonIcono } from "../button";
import { Aviso } from "../feedback";
import { Campo, EntradaTexto } from "../field";
import { Dialogo } from "../overlay";
import {
  borrarDireccionGuardada,
  guardarDireccionConNombre,
  listarDireccionesGuardadas,
  renombrarDireccionGuardada,
} from "./api-direcciones";

/**
 * **Mis direcciones**: guardar con nombre lo que has elegido y volver a ponerlo de un clic.
 *
 * Vive dentro del panel de dirección, así que está en los **dos** sitios donde se dirige un clip: «Crear» y la
 * escena de un proyecto. Lo que se guarda son las claves del catálogo y tu texto, nunca el prompt (ADR-0022),
 * y son **tuyas**: nadie más las ve ni las usa.
 *
 * Aplicar una dirección **no genera nada**: rellena los controles y ahí se queda. Si quien administra ha
 * desactivado alguna opción desde que la guardaste, esa opción se ignora y se te dice cuál, en lugar de
 * enviarse como si nada o de bloquear la dirección entera.
 */
export function DireccionesGuardadas({
  direccion,
  opciones,
  deshabilitado,
  onAplicar,
}: {
  /** Lo elegido ahora mismo: es lo que se guarda al pulsar «Guardar esta dirección». */
  direccion: DireccionElegidaConAcento;
  opciones: OpcionesDeDireccion;
  deshabilitado?: boolean;
  /** Pone la dirección guardada en los controles. Quien dirige una escena ignora el acento, que es del proyecto. */
  onAplicar: (direccion: DireccionElegidaConAcento) => void;
}) {
  const [guardadas, setGuardadas] = useState<DireccionGuardada[]>([]);
  const [nombrando, setNombrando] = useState(false);
  /** Dirección que se está renombrando, si se está renombrando alguna. */
  const [renombrando, setRenombrando] = useState<DireccionGuardada | null>(null);
  const [nombre, setNombre] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  // La lista se lee una vez al abrir la pantalla: es corta y es tuya.
  useEffect(() => {
    let vivo = true;
    listarDireccionesGuardadas().then((r) => {
      if (!vivo) return;
      if (r.ok) setGuardadas(r.datos);
      else setError(r.error);
    });
    return () => {
      vivo = false;
    };
  }, []);

  const cerrar = () => {
    setNombrando(false);
    setRenombrando(null);
    setNombre("");
  };

  const guardar = async () => {
    setTrabajando(true);
    setError("");
    const respuesta = renombrando
      ? await renombrarDireccionGuardada(renombrando.id, nombre)
      : await guardarDireccionConNombre(nombre, direccion);
    setTrabajando(false);
    if (!respuesta.ok) {
      setError(respuesta.error);
      return;
    }
    const guardada = respuesta.datos;
    setGuardadas((antes) => [guardada, ...antes.filter((d) => d.id !== guardada.id)]);
    cerrar();
  };

  const borrar = async (id: string) => {
    setTrabajando(true);
    setError("");
    const respuesta = await borrarDireccionGuardada(id);
    setTrabajando(false);
    if (respuesta.ok) setGuardadas(respuesta.datos);
    else setError(respuesta.error);
  };

  const aplicar = (guardada: DireccionGuardada) => {
    const aplicada = aplicarDireccionGuardada(guardada.direccion, opciones);
    setAviso(aplicada.aviso);
    onAplicar(aplicada.direccion);
  };

  return (
    <div className="flex flex-col gap-3 rounded-control bg-elevada/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h5 className="font-semibold text-texto">Mis direcciones</h5>
        <Boton
          variante="secundario"
          disabled={deshabilitado || trabajando}
          onClick={() => {
            setError("");
            setNombre("");
            setNombrando(true);
          }}
        >
          <BookmarkPlus className="size-5" aria-hidden />
          Guardar esta dirección
        </Boton>
      </div>

      {guardadas.length === 0 ? (
        <p className="text-sm text-texto-suave">
          Todavía no has guardado ninguna. Guarda la que uses a menudo y la vuelves a poner de un clic, sin
          reconstruirla botón a botón.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {guardadas.map((guardada) => (
            <li
              key={guardada.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-borde bg-superficie px-3 py-2"
            >
              <span className="font-medium text-texto">{guardada.nombre}</span>
              <span className="flex items-center gap-1">
                <Boton variante="secundario" disabled={deshabilitado || trabajando} onClick={() => aplicar(guardada)}>
                  <Wand2 className="size-5" aria-hidden />
                  Usar
                </Boton>
                <BotonIcono
                  etiqueta={`Cambiar el nombre de «${guardada.nombre}»`}
                  disabled={trabajando}
                  onClick={() => {
                    setError("");
                    setNombre(guardada.nombre);
                    setRenombrando(guardada);
                  }}
                >
                  <Pencil className="size-5" />
                </BotonIcono>
                <BotonIcono
                  etiqueta={`Borrar «${guardada.nombre}»`}
                  disabled={trabajando}
                  onClick={() => void borrar(guardada.id)}
                >
                  <Trash2 className="size-5" />
                </BotonIcono>
              </span>
            </li>
          ))}
        </ul>
      )}

      {aviso !== "" && <Aviso tono="info">{aviso}</Aviso>}
      {error !== "" && <Aviso tono="error">{error}</Aviso>}

      <Dialogo
        abierto={nombrando || renombrando !== null}
        onAbiertoCambio={(v) => !v && cerrar()}
        titulo={renombrando ? "Cambiar el nombre" : "Guardar esta dirección"}
        descripcion={
          renombrando
            ? "Solo cambia el nombre: lo que guardaste sigue igual."
            : "Se guarda todo lo que has elegido arriba, con el nombre que le pongas. No genera nada."
        }
        pie={
          <>
            <Boton variante="secundario" onClick={cerrar}>
              Cancelar
            </Boton>
            <Boton disabled={trabajando || nombre.trim() === ""} onClick={() => void guardar()}>
              {trabajando ? "Guardando…" : "Guardar"}
            </Boton>
          </>
        }
      >
        <Campo etiqueta="Nombre" ayuda="Para reconocerla luego: «Primer plano cocina», «Testimonio sin cámara»…">
          {(props) => (
            <EntradaTexto
              {...props}
              value={nombre}
              maxLength={NOMBRE_DIRECCION_MAXIMO}
              onChange={(e) => setNombre(e.target.value)}
            />
          )}
        </Campo>
      </Dialogo>
    </div>
  );
}
