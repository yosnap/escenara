"use client";

import { Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  type CandidatoAPublicar,
  DECLARACION_PUBLICAR,
  DESCRIPCION_MAXIMA,
  ETIQUETA_TIPO,
  FIRMA_MAXIMA,
  TITULO_MAXIMO,
  type TipoPublicacion,
} from "@/lib/comunidad";
import { Alerta } from "../alerta";
import { Boton } from "../button";
import { Casilla, GrupoOpciones } from "../choice";
import { AreaTexto, Campo, EntradaTexto, SIN_GESTOR_CONTRASENAS } from "../field";
import { publicar } from "./api-comunidad";

const SIN_RETO = "sin-reto";

/**
 * Publicar un original elegible. Pide título, firma, cómo se publica y, si quieres, un reto; y la **declaración
 * expresa** («confirmo que es sintético y quiero publicarlo»), sin la que no se envía. Lo publicado nace pendiente de
 * moderación: el aviso lo dice antes de enviar. Si el servidor lo rechaza, se ve su causa.
 */
export function FormularioPublicar({
  candidato,
  retos,
  firmaSugerida,
}: {
  candidato: CandidatoAPublicar;
  retos: { id: string; titulo: string }[];
  firmaSugerida: string;
}) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoPublicacion>(candidato.tipos[candidato.tipos.length - 1] ?? "clip");
  const [titulo, setTitulo] = useState(candidato.nombre.slice(0, TITULO_MAXIMO));
  const [descripcion, setDescripcion] = useState(candidato.descripcionSugerida);
  const [firma, setFirma] = useState(firmaSugerida.slice(0, FIRMA_MAXIMA));
  const [reto, setReto] = useState<string>(SIN_RETO);
  const [declaracion, setDeclaracion] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intentado, setIntentado] = useState(false);

  const enviar = async () => {
    setIntentado(true);
    if (!declaracion) return;
    setEnviando(true);
    setError(null);
    const r = await publicar({
      origen: candidato.origen,
      tipo,
      titulo,
      descripcion,
      firma,
      reto: reto === SIN_RETO ? null : reto,
      declaracion,
    });
    setEnviando(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    router.push("/comunidad#tus-publicaciones");
    router.refresh();
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void enviar();
      }}
    >
      {candidato.tipos.length > 1 && (
        <GrupoOpciones
          etiqueta="Cómo lo publicas"
          valor={tipo}
          onCambio={(v) => setTipo(v as TipoPublicacion)}
          opciones={candidato.tipos.map((t) => ({
            value: t,
            etiqueta: ETIQUETA_TIPO[t],
            descripcion:
              t === "clip"
                ? "Se ve en la galería como un clip o una imagen."
                : `Como ejemplo de «${candidato.plantilla?.nombre ?? ""}»: quien lo vea podrá usar ese ${t} en «Crear».`,
          }))}
        />
      )}
      <Campo etiqueta="Título" ayuda={`Hasta ${TITULO_MAXIMO} caracteres. Lo verá toda la instalación.`}>
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
      <Campo etiqueta="Descripción (opcional)" ayuda="Qué es, cómo lo hiciste. Sin nombres de personas reales.">
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
      <Campo etiqueta="Firma" ayuda="El nombre con el que apareces. No hace falta que sea el de tu cuenta.">
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
      {retos.length > 0 && (
        // Pocos retos a la vez: un grupo de opciones (el mismo control que el tipo) en lugar de un desplegable.
        <GrupoOpciones
          etiqueta="Reto (opcional)"
          valor={reto}
          onCambio={setReto}
          opciones={[
            { value: SIN_RETO, etiqueta: "Sin reto" },
            ...retos.map((r) => ({ value: r.id, etiqueta: r.titulo })),
          ]}
        />
      )}
      <Casilla
        etiqueta={DECLARACION_PUBLICAR}
        marcada={declaracion}
        onCambio={setDeclaracion}
        error={intentado && !declaracion ? "Sin esta declaración no se publica nada." : undefined}
      />
      <Alerta tipo="info" anuncio="ninguno" compacta>
        Nadie más lo verá hasta que lo apruebe quien modera. Podrás retirarlo cuando quieras: se borra la copia
        publicada y tu original no cambia.
      </Alerta>
      {error && (
        <Alerta tipo="error" titulo="No se ha publicado">
          {error}
        </Alerta>
      )}
      <Boton
        type="submit"
        variante="chispa"
        icono={<Send className="size-4" />}
        cargando={enviando}
        className="self-start"
      >
        Enviar a moderación
      </Boton>
    </form>
  );
}
