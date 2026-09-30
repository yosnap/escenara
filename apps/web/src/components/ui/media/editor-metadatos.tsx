"use client";

import { Copy } from "lucide-react";
import { type FormEvent, useState } from "react";
import { ETIQUETA_TIPO, formatearDuracion, formatearTamano } from "@/lib/media/reglas";
import type { Medio } from "@/lib/media/tipos";
import { Boton } from "../button";
import { Aviso } from "../feedback";
import { Campo, EntradaTexto } from "../field";
import { Dialogo } from "../overlay";
import { guardarMetadatos } from "./api-medios";
import { VisorMedio } from "./visor-medio";

/** Edición del título y los textos alternativos (es/en), con los datos del archivo en solo lectura. */
export function EditorMetadatos({
  medio,
  onCerrar,
  onGuardado,
}: {
  medio: Medio | null;
  onCerrar: () => void;
  onGuardado: (medio: Medio) => void;
}) {
  return (
    <Dialogo
      abierto={medio !== null}
      onAbiertoCambio={(abierto) => !abierto && onCerrar()}
      titulo="Datos del medio"
      descripcion="El texto alternativo describe la imagen a quien no puede verla."
      tamano="xl"
    >
      {medio && <Formulario key={medio.id} medio={medio} onGuardado={onGuardado} onCerrar={onCerrar} />}
    </Dialogo>
  );
}

function Formulario({
  medio,
  onGuardado,
  onCerrar,
}: {
  medio: Medio;
  onGuardado: (medio: Medio) => void;
  onCerrar: () => void;
}) {
  const [titulo, setTitulo] = useState(medio.titulo);
  const [altEs, setAltEs] = useState(medio.altEs);
  const [altEn, setAltEn] = useState(medio.altEn);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async (evento: FormEvent) => {
    evento.preventDefault();
    setGuardando(true);
    setError(null);
    const r = await guardarMetadatos(medio.id, { titulo, altEs, altEn });
    setGuardando(false);
    if (r.ok) onGuardado(r.datos);
    else setError(r.error);
  };

  const datos: [string, string][] = [
    ["Nombre", medio.nombre],
    ["Tipo", `${ETIQUETA_TIPO[medio.tipo]} · ${medio.mime}`],
    ...(medio.ancho && medio.alto ? [["Dimensiones", `${medio.ancho} × ${medio.alto} px`] as [string, string]] : []),
    ...(medio.duracion ? [["Duración", formatearDuracion(medio.duracion)] as [string, string]] : []),
    ["Tamaño", formatearTamano(medio.tamano)],
    ...(medio.origen ? [["Origen", medio.origen] as [string, string]] : []),
    ["Subido", new Date(medio.creadoEn).toLocaleString("es-ES", { dateStyle: "long", timeStyle: "short" })],
  ];

  return (
    <form onSubmit={guardar} className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="flex flex-col gap-4">
        {/* El medio se ve entero en su proporción: un vertical no se mete en un marco horizontal. */}
        <VisorMedio medio={medio} alturaMaxima="55dvh" />
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          {datos.map(([clave, valor]) => (
            <div key={clave} className="contents">
              <dt className="text-texto-suave">{clave}</dt>
              <dd className="break-all text-texto">{valor}</dd>
            </div>
          ))}
        </dl>
        <Boton
          variante="secundario"
          tamano="sm"
          icono={<Copy className="size-4" />}
          onClick={() => navigator.clipboard?.writeText(medio.url)}
        >
          Copiar enlace temporal (1 h)
        </Boton>
      </div>

      <div className="flex flex-col gap-4">
        <Campo etiqueta="Título">
          {(p) => <EntradaTexto {...p} value={titulo} maxLength={500} onChange={(e) => setTitulo(e.target.value)} />}
        </Campo>
        <Campo etiqueta="Texto alternativo (español)" ayuda="Qué se ve, en una frase.">
          {(p) => <EntradaTexto {...p} value={altEs} maxLength={500} onChange={(e) => setAltEs(e.target.value)} />}
        </Campo>
        <Campo etiqueta="Texto alternativo (inglés)">
          {(p) => <EntradaTexto {...p} value={altEn} maxLength={500} onChange={(e) => setAltEn(e.target.value)} />}
        </Campo>
        {error && <Aviso tono="error">{error}</Aviso>}
        <div className="mt-auto flex justify-end gap-3">
          <Boton variante="fantasma" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" cargando={guardando}>
            Guardar datos
          </Boton>
        </div>
      </div>
    </form>
  );
}
