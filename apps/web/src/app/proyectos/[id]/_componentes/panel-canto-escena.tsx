"use client";

import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { DeclaracionDerechosCanto } from "@/components/ui/canto/declaracion-derechos";
import { pedirCanto, useCanto } from "@/components/ui/canto/use-canto";
import { Aviso } from "@/components/ui/feedback";
import { SelectorMedios } from "@/components/ui/media/selector-medios";
import type { DeclaracionCantoVista, TipoDerechosCanto } from "@/lib/canto";
import type { ProyectoDetalle } from "@/lib/proyectos";
import { consultarProyecto } from "../../_componentes/api-proyectos";

function FormularioDeclaracion({
  audioId,
  declaracion,
  onGuardada,
}: {
  audioId: string;
  declaracion: DeclaracionCantoVista | null;
  onGuardada: () => Promise<void>;
}) {
  const [tipo, setTipo] = useState<TipoDerechosCanto>(declaracion?.tipo ?? "propia");
  const [referencia, setReferencia] = useState(declaracion?.referenciaLicencia ?? "");
  const [aceptada, setAceptada] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const guardar = async () => {
    setOcupado(true);
    const resultado = await pedirCanto<{ declaracion: DeclaracionCantoVista }>("/api/canto/declaracion", "POST", {
      medioId: audioId,
      tipo,
      referenciaLicencia: referencia,
      aceptado: aceptada,
    });
    setOcupado(false);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    setError(null);
    setAceptada(false);
    await onGuardada();
  };
  return (
    <div className="flex flex-col gap-3">
      {declaracion && (
        <Aviso tono="correcto">
          Derechos declarados el {new Date(declaracion.aceptadoEn).toLocaleDateString("es-ES")}. Puedes actualizar la
          declaración si ha cambiado tu licencia.
        </Aviso>
      )}
      <DeclaracionDerechosCanto
        tipo={tipo}
        referencia={referencia}
        aceptada={aceptada}
        onTipo={(valor) => {
          setTipo(valor);
          setAceptada(false);
        }}
        onReferencia={setReferencia}
        onAceptada={setAceptada}
      />
      {error && <Aviso tono="error">{error}</Aviso>}
      <Boton variante="secundario" onClick={() => void guardar()} disabled={!aceptada || ocupado} cargando={ocupado}>
        Guardar declaración de derechos
      </Boton>
    </div>
  );
}

/** Audio, derechos y validación del retrato de una escena ya guardada como «cantar». */
export function PanelCantoEscena({
  escenaId,
  proyectoId,
  onProyectoCambio,
}: {
  escenaId: string;
  proyectoId: string;
  onProyectoCambio: (detalle: ProyectoDetalle) => void;
}) {
  const { canto, error, ocupado, cargar, elegir } = useCanto(escenaId);
  const elegirYActualizar = async (medioId: string | null) => {
    if (!(await elegir(medioId))) return;
    const resultado = await consultarProyecto(proyectoId);
    if (resultado.ok) onProyectoCambio(resultado.datos);
  };
  return (
    <section className="flex flex-col gap-4 rounded-tarjeta border-2 border-borde bg-elevada p-4">
      <div>
        <h3 className="text-lg font-bold text-texto">Cantar o hablar con tu audio</h3>
        <p className="text-sm text-texto-suave">
          El clip sigue lo que se oye en tu archivo. Escenara no genera ni cambia la voz.
        </p>
      </div>
      {error && <Aviso tono="error">{error}</Aviso>}
      {!canto && !error && (
        <p role="status" className="text-sm text-texto-suave">
          Comprobando audio y derechos…
        </p>
      )}
      {canto && (
        <>
          {!canto.activo && (
            <Aviso tono="info">
              Quien administra tiene desactivadas las escenas de canto. Puedes preparar el audio y la declaración, pero
              no se generará ningún clip.
            </Aviso>
          )}
          <SelectorMedios
            etiqueta="Tu audio para este clip"
            ayuda={`Sube un MP3, WAV, OGG, M4A o AAC o elige uno de tu biblioteca. Máximo ${canto.segundosMaximos} s; si dura más, recórtalo antes de elegirlo.`}
            tipos={["audio"]}
            valor={canto.audio ? [canto.audio] : []}
            onCambio={(medios) => void elegirYActualizar(medios[0]?.id ?? null)}
          />
          {ocupado && <p role="status">Comprobando la duración del audio…</p>}
          {canto.audio && (
            <FormularioDeclaracion
              key={canto.audio.id}
              audioId={canto.audio.id}
              declaracion={canto.declaracion}
              onGuardada={cargar}
            />
          )}
          <Aviso tono={canto.retrato.vertical ? "correcto" : "info"}>
            Retrato de partida: {canto.retrato.proporcion}.{" "}
            {canto.retrato.vertical
              ? "Es vertical; el modelo usará esta proporción para el vídeo."
              : "Necesitas un retrato del personaje más alto que ancho. El modelo no ofrece una opción para forzar 9:16."}
          </Aviso>
          {canto.coste && (
            <p className="rounded-control bg-superficie p-3 font-mono text-sm text-texto">
              Estimación: {canto.segundosFacturados} s × {canto.coste.creditosPorSegundo} créditos/s ={" "}
              {canto.coste.creditosAConfirmar} créditos ({canto.resolucion}). Precio comprobado:{" "}
              {canto.coste.comprobado}.
            </p>
          )}
          {canto.impedimentos.length > 0 && (
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-texto">
              {canto.impedimentos.map((i) => (
                <li key={i.clave}>
                  {i.motivo} {i.accion}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
