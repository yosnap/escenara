"use client";

import { UploadCloud } from "lucide-react";
import { type DragEvent, Suspense, useDeferredValue, useRef, useState, useSyncExternalStore } from "react";
import { TIPOS_MEDIO, type TipoMedio } from "@/lib/media/reglas";
import type { Medio } from "@/lib/media/tipos";
import { Boton } from "../button";
import { cn } from "../cn";
import { Aviso } from "../feedback";
import { CargadorChispa } from "../motion";
import { Dialogo } from "../overlay";
import {
  eliminarDefinitivamente,
  enviarAPapelera,
  reemplazarImagen,
  restaurarMedio,
  subirMedio,
  urlArchivoPropio,
} from "./api-medios";
import { BarraBiblioteca } from "./barra-biblioteca";
import { EditorImagen, type ModoGuardado } from "./editor-imagen";
import { EditorMetadatos } from "./editor-metadatos";
import { EditorSubida } from "./editor-subida";
import type { AccionesMedio, VistaBiblioteca } from "./elemento-medio";
import { ListaSubidas } from "./lista-subidas";
import { type Consulta, ResultadosBiblioteca } from "./resultados-biblioteca";
import { SubidaUrl } from "./subida-url";
import { useSubidaMedios } from "./use-subida-medios";

const ESPERA_BUSQUEDA_MS = 300;
const nada = () => () => {};

export interface BibliotecaMediosProps {
  /** Tipos que se pueden ver y subir. Por defecto, todos. */
  tipos?: readonly TipoMedio[];
  /** Con selección: pulsar un medio lo añade o lo quita. */
  seleccion?: ReadonlySet<string>;
  onAlternar?: (medio: Medio) => void;
  onSubido?: (medio: Medio) => void;
  onActualizado?: (medio: Medio) => void;
  /** Un medio sale de la vista activa (papelera o borrado). */
  onRetirado?: (id: string) => void;
  /** Solo los medios de esta colección. */
  coleccion?: string | null;
  /** Solo administradores: «todos» o el id de un usuario. */
  propietario?: string | null;
  /** Sin subida (p. ej., en la vista de administración de medios ajenos). */
  permitirSubida?: boolean;
  /** Deja fuera los documentos de consentimiento: no son fotos elegibles. */
  sinDocumentos?: boolean;
  /** Cambia algo en la biblioteca (subida, papelera, borrado…): para refrescar contadores fuera. */
  onCambio?: () => void;
}

/** Biblioteca de medios: búsqueda, filtros, vista, paginación, subida con editor, papelera y edición. */
export function BibliotecaMedios(props: BibliotecaMediosProps) {
  // La biblioteca pide datos al servidor desde el navegador: no se renderiza en el servidor.
  const montado = useSyncExternalStore(
    nada,
    () => true,
    () => false,
  );
  return montado ? <Biblioteca {...props} /> : <CargadorChispa etiqueta="Cargando biblioteca" />;
}

function Biblioteca({
  tipos = TIPOS_MEDIO,
  seleccion = new Set(),
  onAlternar,
  onSubido,
  onActualizado,
  onRetirado,
  coleccion = null,
  propietario = null,
  permitirSubida = true,
  sinDocumentos = false,
  onCambio,
}: BibliotecaMediosProps) {
  const todos = tipos.length === TIPOS_MEDIO.length ? [] : [...tipos];
  const [consulta, setConsulta] = useState<Consulta>({
    filtro: { busqueda: "", tipos: todos, papelera: false, pagina: 1, sinDocumentos },
    version: 0,
  });
  const diferidaBase = useDeferredValue(consulta);
  // La colección y el dueño salen siempre de las props (no se congelan en el estado inicial).
  const diferida: Consulta = {
    ...diferidaBase,
    filtro: { ...diferidaBase.filtro, coleccion, propietario, sinDocumentos },
  };
  const [texto, setTexto] = useState("");
  const [vista, setVista] = useState<VistaBiblioteca>("cuadricula");
  const [arrastrando, setArrastrando] = useState(false);
  const [desdeUrl, setDesdeUrl] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enDatos, setEnDatos] = useState<Medio | null>(null);
  const [enImagen, setEnImagen] = useState<Medio | null>(null);
  const [aEliminar, setAEliminar] = useState<Medio | null>(null);
  // Personajes que usan el medio que se intenta borrar: se enumeran y se pide una segunda confirmación.
  const [enUsoPor, setEnUsoPor] = useState<{ id: string; nombre: string }[] | null>(null);
  const [borrando, setBorrando] = useState(false);
  const espera = useRef<ReturnType<typeof setTimeout>>(undefined);

  const filtrar = (cambios: Partial<Consulta["filtro"]>) =>
    setConsulta((c) => ({ ...c, filtro: { ...c.filtro, pagina: 1, ...cambios } }));
  const recargar = () => {
    setConsulta((c) => ({ ...c, version: c.version + 1 }));
    onCambio?.();
  };

  const subida = useSubidaMedios({
    tipos,
    onSubido: (medio) => {
      recargar();
      onSubido?.(medio);
    },
  });

  const buscar = (valor: string) => {
    setTexto(valor);
    clearTimeout(espera.current);
    espera.current = setTimeout(() => filtrar({ busqueda: valor }), ESPERA_BUSQUEDA_MS);
  };

  /** Devuelve `true` si el medio está en uso y hay que volver a preguntar, en lugar de cerrar el diálogo. */
  const ejecutar = async (
    accion: Promise<{ ok: boolean; error?: string; enUsoPor?: { id: string; nombre: string }[] }>,
    retirado?: string,
  ): Promise<boolean> => {
    setAviso(null);
    const r = await accion;
    if (!r.ok) {
      setAviso(r.error ?? "No se ha podido completar la operación.");
      if (r.enUsoPor && r.enUsoPor.length > 0) {
        setEnUsoPor(r.enUsoPor);
        return true;
      }
      return false;
    }
    if (retirado) onRetirado?.(retirado);
    recargar();
    return false;
  };

  /** Abre el diálogo de borrado definitivo desde cero: sin aviso de uso previo. */
  const pedirBorrado = (medio: Medio | null) => {
    setEnUsoPor(null);
    setAEliminar(medio);
  };

  const acciones: AccionesMedio = {
    onEditarDatos: setEnDatos,
    onEditarImagen: setEnImagen,
    onPapelera: (m) => ejecutar(enviarAPapelera(m.id), m.id),
    onRestaurar: (m) => ejecutar(restaurarMedio(m.id)),
    onEliminar: pedirBorrado,
  };

  const guardarImagenEditada = async (archivo: File, modo: ModoGuardado) => {
    if (!enImagen) return null;
    const r =
      modo === "sobrescribir"
        ? await reemplazarImagen(enImagen.id, archivo)
        : await subirMedio(archivo, {}, undefined, tipos);
    if (!r.ok) return r.error;
    setEnImagen(null);
    recargar();
    if (modo === "sobrescribir") onActualizado?.(r.datos);
    else onSubido?.(r.datos);
    return null;
  };

  const soltar = (e: DragEvent) => {
    e.preventDefault();
    setArrastrando(false);
    if (!permitirSubida) return;
    subida.agregar(Array.from(e.dataTransfer.files));
  };

  const tipoActivo = tipos.length > 1 && consulta.filtro.tipos.length === 1 ? (consulta.filtro.tipos[0] ?? null) : null;

  return (
    <section
      aria-label="Biblioteca de medios"
      className="relative flex flex-col gap-4"
      onDragOver={(e) => {
        e.preventDefault();
        if (permitirSubida) setArrastrando(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setArrastrando(false);
      }}
      onDrop={soltar}
    >
      <BarraBiblioteca
        tiposPermitidos={tipos}
        busqueda={texto}
        onBusqueda={buscar}
        tipo={tipoActivo}
        onTipo={(t) => filtrar({ tipos: t ? [t] : todos })}
        vista={vista}
        onVista={setVista}
        papelera={consulta.filtro.papelera}
        onPapelera={(papelera) => filtrar({ papelera })}
        onArchivos={subida.agregar}
        editarAlSubir={subida.editarAlSubir}
        onEditarAlSubir={subida.setEditarAlSubir}
        desdeUrl={desdeUrl}
        permitirSubida={permitirSubida}
        onDesdeUrl={setDesdeUrl}
      />

      {desdeUrl && (
        <SubidaUrl
          tipos={tipos}
          onSubido={(medio) => {
            recargar();
            onSubido?.(medio);
          }}
        />
      )}

      <ListaSubidas subidas={subida.subidas} onLimpiar={subida.limpiarTerminadas} />

      {aviso && <Aviso tono="error">{aviso}</Aviso>}

      <div
        className={cn("transition-opacity duration-(--motion-fast)", consulta !== diferidaBase && "opacity-60")}
        aria-busy={consulta !== diferidaBase}
      >
        <Suspense fallback={<CargadorChispa etiqueta="Cargando medios" />}>
          <ResultadosBiblioteca
            consulta={diferida}
            vista={vista}
            seleccion={seleccion}
            onAlternar={onAlternar}
            acciones={acciones}
            onPagina={(pagina) => setConsulta((c) => ({ ...c, filtro: { ...c.filtro, pagina } }))}
            onReintentar={recargar}
          />
        </Suspense>
      </div>

      {arrastrando && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-tarjeta border-2 border-dashed border-acento bg-superficie/90 text-acento">
          <UploadCloud className="size-10" aria-hidden />
          <p className="text-lg font-bold">Suelta los archivos para subirlos</p>
        </div>
      )}

      <EditorSubida subida={subida} />
      <EditorImagen
        fuente={
          enImagen && {
            url: urlArchivoPropio(enImagen.id, enImagen.actualizadoEn),
            nombre: enImagen.nombre,
            puedeSobrescribir: true,
          }
        }
        onCerrar={() => setEnImagen(null)}
        onGuardar={guardarImagenEditada}
      />

      <EditorMetadatos
        medio={enDatos}
        onCerrar={() => setEnDatos(null)}
        onGuardado={(medio) => {
          setEnDatos(null);
          recargar();
          onActualizado?.(medio);
        }}
      />

      <Dialogo
        abierto={aEliminar !== null}
        onAbiertoCambio={(abierto) => !abierto && pedirBorrado(null)}
        titulo={enUsoPor ? "Esta foto está en uso" : "¿Eliminar definitivamente?"}
        descripcion={`«${aEliminar?.nombre ?? ""}» se borrará del almacenamiento. Esta acción no se puede deshacer.`}
        pie={
          <>
            <Boton variante="fantasma" onClick={() => pedirBorrado(null)}>
              Cancelar
            </Boton>
            <Boton
              variante="peligro"
              cargando={borrando}
              onClick={async () => {
                if (!aEliminar) return;
                // La primera vez se manda sin confirmar: si está en uso, el servidor avisa y no borra nada, y
                // entonces el diálogo se queda abierto enumerando a quién afecta. En cualquier otro caso se
                // cierra, como en 0.8.0: dejarlo abierto tras un borrado hecho era una regresión.
                setBorrando(true);
                const volverAPreguntar = await ejecutar(
                  eliminarDefinitivamente(aEliminar.id, enUsoPor !== null),
                  aEliminar.id,
                );
                setBorrando(false);
                if (!volverAPreguntar) setAEliminar(null);
              }}
            >
              {enUsoPor ? "Borrar de todas formas" : "Eliminar"}
            </Boton>
          </>
        }
      >
        {enUsoPor && (
          <div className="flex flex-col gap-2">
            <p className="text-texto">
              Se usa en {enUsoPor.length === 1 ? "este personaje" : `estos ${enUsoPor.length} personajes`}:
            </p>
            <ul className="flex list-inside list-disc flex-col gap-1 text-texto">
              {enUsoPor.map((p) => (
                <li key={p.id}>{p.nombre}</li>
              ))}
            </ul>
            <p className="text-texto-suave">
              Si la borras, pierden esa referencia y puede que se queden sin las suficientes para poder generar.
            </p>
          </div>
        )}
      </Dialogo>
    </section>
  );
}
