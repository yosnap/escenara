"use client";

import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { GrupoOpciones } from "@/components/ui/choice";
import { Aviso } from "@/components/ui/feedback";
import { AreaTexto, Campo, EntradaTexto } from "@/components/ui/field";
import { Dialogo } from "@/components/ui/overlay";
import {
  type Capacidad,
  DESCRIPCION_ESTADO_MODELO,
  ESTADOS_MODELO,
  type EstadoModelo,
  ETIQUETA_CAPACIDAD,
  ETIQUETA_ESTADO_MODELO,
  EVIDENCIA_MINIMA,
  esSeleccionable,
  type ModeloVista,
} from "@/lib/catalogo";
import { cambiarEstadoAccion, guardarPrecioAccion, marcarPredeterminadoAccion, type ResultadoModelo } from "./acciones";

/**
 * Diálogos con los que quien administra cambia el precio y el estado de un modelo. El precio siempre lleva
 * fuente y fecha; `validado` exige evidencia escrita. Nada de esto se puede hacer sin ser administrador: la
 * acción del servidor lo vuelve a comprobar.
 */

const HOY = () => new Date().toISOString().slice(0, 10);

export function DialogoPrecio({
  modelo,
  onResultado,
}: {
  modelo: ModeloVista;
  onResultado: (resultado: ResultadoModelo) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [creditos, setCreditos] = useState(String(modelo.precio?.creditos ?? ""));
  const [fuente, setFuente] = useState(modelo.precio?.fuente ?? "");
  const [comprobado, setComprobado] = useState(modelo.precio?.comprobado ?? HOY());
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    const resultado = await guardarPrecioAccion({
      modeloId: modelo.id,
      creditos: Number(creditos.replace(",", ".")),
      fuente,
      comprobado,
    });
    setGuardando(false);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    setAbierto(false);
    onResultado(resultado);
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoCambio={setAbierto}
      disparador={
        <Boton variante="secundario" tamano="sm">
          {modelo.precio ? "Editar precio" : "Registrar precio"}
        </Boton>
      }
      titulo={`Precio de ${modelo.nombre}`}
      descripcion={`Créditos por ${modelo.unidad}, con la fuente y la fecha en que se comprobó.`}
      pie={
        <>
          <Boton variante="fantasma" onClick={() => setAbierto(false)}>
            Cancelar
          </Boton>
          <Boton onClick={guardar} cargando={guardando}>
            Guardar precio
          </Boton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Campo
          etiqueta={`Créditos por ${modelo.unidad}`}
          ayuda="Lo que cobró el proveedor de verdad, no una estimación de terceros."
        >
          {(props) => (
            <EntradaTexto
              {...props}
              inputMode="decimal"
              value={creditos}
              onChange={(e) => setCreditos(e.target.value)}
              placeholder="4"
            />
          )}
        </Campo>
        <Campo etiqueta="Fuente" ayuda="Dónde se midió: informe, prueba real, panel del proveedor…">
          {(props) => (
            <AreaTexto
              {...props}
              value={fuente}
              onChange={(e) => setFuente(e.target.value)}
              className="min-h-20"
              placeholder="Medido con la cuenta de KIE del propietario el 2026-09-27 (informe de la comparativa)."
            />
          )}
        </Campo>
        <Campo
          etiqueta="Comprobado el"
          ayuda="Un precio sin fecha no vale: a los 90 días se avisa de que puede haber cambiado."
        >
          {(props) => (
            <EntradaTexto {...props} type="date" value={comprobado} onChange={(e) => setComprobado(e.target.value)} />
          )}
        </Campo>
        {error && <Aviso tono="error">{error}</Aviso>}
      </div>
    </Dialogo>
  );
}

export function DialogoEstado({
  modelo,
  onResultado,
}: {
  modelo: ModeloVista;
  onResultado: (resultado: ResultadoModelo) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [estado, setEstado] = useState<EstadoModelo>(modelo.estado);
  const [evidencia, setEvidencia] = useState(modelo.evidencia);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const faltaEvidencia = estado === "validado" && evidencia.trim().length < EVIDENCIA_MINIMA;

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    const resultado = await cambiarEstadoAccion({ modeloId: modelo.id, estado, evidencia });
    setGuardando(false);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    setAbierto(false);
    onResultado(resultado);
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoCambio={setAbierto}
      disparador={
        <Boton variante="secundario" tamano="sm">
          Cambiar estado
        </Boton>
      }
      titulo={`Estado de ${modelo.nombre}`}
      descripcion="Solo quien administra cambia el estado, y validar exige evidencia."
      pie={
        <>
          <Boton variante="fantasma" onClick={() => setAbierto(false)}>
            Cancelar
          </Boton>
          <Boton onClick={guardar} cargando={guardando} disabled={faltaEvidencia}>
            Guardar estado
          </Boton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <GrupoOpciones
          etiqueta="Estado del registro"
          opciones={ESTADOS_MODELO.map((e) => ({
            value: e,
            etiqueta: ETIQUETA_ESTADO_MODELO[e],
            descripcion: DESCRIPCION_ESTADO_MODELO[e],
          }))}
          valor={estado}
          onCambio={(v) => setEstado(v as EstadoModelo)}
        />
        <Campo
          etiqueta="Evidencia"
          ayuda={`Obligatoria para validar: coste medido y ejemplo o informe (mínimo ${EVIDENCIA_MINIMA} caracteres).`}
          error={faltaEvidencia ? "Sin evidencia no se puede validar un modelo." : undefined}
        >
          {(props) => (
            <AreaTexto
              {...props}
              value={evidencia}
              onChange={(e) => setEvidencia(e.target.value)}
              placeholder="60 créditos por clip de 4 s medidos el 2026-09-27; clip con voz comprobado de extremo a extremo."
            />
          )}
        </Campo>
        {error && <Aviso tono="error">{error}</Aviso>}
      </div>
    </Dialogo>
  );
}

/**
 * Marca el modelo como opción por defecto de una de sus capacidades (una por capacidad). Sirve además para
 * poder retirar el predeterminado: hay que designar otro antes.
 */
export function BotonesPredeterminado({
  modelo,
  onResultado,
}: {
  modelo: ModeloVista;
  onResultado: (resultado: ResultadoModelo) => void;
}) {
  const [guardando, setGuardando] = useState<string | null>(null);
  if (modelo.predeterminado || !esSeleccionable(modelo.estado) || modelo.precio === null) return null;

  const marcar = async (capacidad: Capacidad) => {
    setGuardando(capacidad);
    onResultado(await marcarPredeterminadoAccion({ modeloId: modelo.id, capacidad }));
    setGuardando(null);
  };

  return (
    <>
      {modelo.capacidades.map((capacidad) => (
        <Boton
          key={capacidad}
          variante="secundario"
          tamano="sm"
          cargando={guardando === capacidad}
          onClick={() => marcar(capacidad)}
        >
          Por defecto en {ETIQUETA_CAPACIDAD[capacidad].toLowerCase()}
        </Boton>
      ))}
    </>
  );
}
