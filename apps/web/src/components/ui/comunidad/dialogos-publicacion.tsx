"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DESCRIPCION_MAXIMA, FIRMA_MAXIMA, type MiPublicacionVista, TITULO_MAXIMO } from "@/lib/comunidad";
import { Alerta } from "../alerta";
import { Boton } from "../button";
import { AreaTexto, Campo, EntradaTexto, SIN_GESTOR_CONTRASENAS } from "../field";
import { Dialogo } from "../overlay";
import { editarPublicacion, retirarPublicacion } from "./api-comunidad";

type Props = { publicacion: MiPublicacionVista; abierto: boolean; onAbiertoCambio: (v: boolean) => void };

/** Editar título, descripción y firma. Al guardar vuelve a moderación: lo dice antes de pulsar. */
export function DialogoEditarPublicacion({ publicacion, abierto, onAbiertoCambio }: Props) {
  const router = useRouter();
  const [titulo, setTitulo] = useState(publicacion.titulo);
  const [descripcion, setDescripcion] = useState(publicacion.descripcion);
  const [firma, setFirma] = useState(publicacion.firma);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const guardar = async () => {
    setOcupado(true);
    setError(null);
    const r = await editarPublicacion(publicacion.id, {
      titulo,
      descripcion,
      firma,
      reto: publicacion.reto?.id ?? null,
    });
    setOcupado(false);
    if (!r.ok) return setError(r.error);
    onAbiertoCambio(false);
    router.refresh();
  };
  return (
    <Dialogo
      titulo="Editar la publicación"
      descripcion="Al guardar vuelve a moderación: deja de verse hasta que se apruebe otra vez."
      abierto={abierto}
      onAbiertoCambio={onAbiertoCambio}
      pie={
        <Boton cargando={ocupado} onClick={() => void guardar()}>
          Guardar y enviar a moderación
        </Boton>
      }
    >
      <div className="flex flex-col gap-4">
        <Campo etiqueta="Título">
          {(p) => (
            <EntradaTexto
              {...p}
              {...SIN_GESTOR_CONTRASENAS}
              value={titulo}
              maxLength={TITULO_MAXIMO}
              onChange={(e) => setTitulo(e.target.value)}
            />
          )}
        </Campo>
        <Campo etiqueta="Descripción">
          {(p) => (
            <AreaTexto
              {...p}
              rows={3}
              value={descripcion}
              maxLength={DESCRIPCION_MAXIMA}
              onChange={(e) => setDescripcion(e.target.value)}
            />
          )}
        </Campo>
        <Campo etiqueta="Firma">
          {(p) => (
            <EntradaTexto
              {...p}
              {...SIN_GESTOR_CONTRASENAS}
              value={firma}
              maxLength={FIRMA_MAXIMA}
              onChange={(e) => setFirma(e.target.value)}
            />
          )}
        </Campo>
        {error && (
          <Alerta tipo="error" titulo="No se ha guardado">
            {error}
          </Alerta>
        )}
      </div>
    </Dialogo>
  );
}

/** Retirar: borra la copia publicada; el original no cambia. */
export function DialogoRetirarPublicacion({ publicacion, abierto, onAbiertoCambio }: Props) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const retirar = async () => {
    setOcupado(true);
    setError(null);
    const r = await retirarPublicacion(publicacion.id);
    setOcupado(false);
    if (!r.ok) return setError(r.error);
    onAbiertoCambio(false);
    router.refresh();
  };
  return (
    <Dialogo
      titulo="Retirar la publicación"
      descripcion="Se borra la copia publicada y deja de verse en la galería. Tu original (personaje o archivo) no cambia."
      abierto={abierto}
      onAbiertoCambio={onAbiertoCambio}
      pie={
        <Boton variante="peligro" cargando={ocupado} onClick={() => void retirar()}>
          Retirar y borrar la copia
        </Boton>
      }
    >
      {error && (
        <Alerta tipo="error" titulo="No se ha retirado">
          {error}
        </Alerta>
      )}
    </Dialogo>
  );
}
