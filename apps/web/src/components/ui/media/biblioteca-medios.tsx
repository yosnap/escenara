"use client";

import { UploadCloud } from "lucide-react";
import { type DragEvent, Suspense, useDeferredValue, useRef, useState, useSyncExternalStore } from "react";
import { TIPOS_MEDIO, type TipoMedio } from "@/lib/media/reglas";
import type { Medio } from "@/lib/media/tipos";
import { Boton } from "../button";
import { cn } from "../cn";
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
}: BibliotecaMediosProps) {
  const todos = tipos.length === TIPOS_MEDIO.length ? [] : [...tipos];
  const [consulta, setConsulta] = useState<Consulta>({
    filtro: { busqueda: "", tipos: todos, papelera: false, pagina: 1 },
    version: 0,
  });
  const diferida = useDeferredValue(consulta);
  const [texto, setTexto] = useState("");
  const [vista, setVista] = useState<VistaBiblioteca>("cuadricula");
  const [arrastrando, setArrastrando] = useState(false);
  const [desdeUrl, setDesdeUrl] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enDatos, setEnDatos] = useState<Medio | null>(null);
  const [enImagen, setEnImagen] = useState<Medio | null>(null);
  const [aEliminar, setAEliminar] = useState<Medio | null>(null);
  const espera = useRef<ReturnType<typeof setTimeout>>(undefined);

  const filtrar = (cambios: Partial<Consulta["filtro"]>) =>
    setConsulta((c) => ({ ...c, filtro: { ...c.filtro, pagina: 1, ...cambios } }));
  const recargar = () => setConsulta((c) => ({ ...c, version: c.version + 1 }));

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

  const ejecutar = async (accion: Promise<{ ok: boolean; error?: string }>, retirado?: string) => {
    setAviso(null);
    const r = await accion;
    if (!r.ok) return setAviso(r.error ?? "No se ha podido completar la operación.");
    if (retirado) onRetirado?.(retirado);
    recargar();
  };

  const acciones: AccionesMedio = {
    onEditarDatos: setEnDatos,
    onEditarImagen: setEnImagen,
    onPapelera: (m) => ejecutar(enviarAPapelera(m.id), m.id),
    onRestaurar: (m) => ejecutar(restaurarMedio(m.id)),
    onEliminar: setAEliminar,
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
    subida.agregar(Array.from(e.dataTransfer.files));
  };

  const tipoActivo = tipos.length > 1 && consulta.filtro.tipos.length === 1 ? (consulta.filtro.tipos[0] ?? null) : null;

  return (
    <section
      aria-label="Biblioteca de medios"
      className="relative flex flex-col gap-4"
      onDragOver={(e) => {
        e.preventDefault();
        setArrastrando(true);
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

      {aviso && (
        <p role="alert" className="font-medium text-error">
          {aviso}
        </p>
      )}

      <div
        className={cn("transition-opacity duration-(--motion-fast)", consulta !== diferida && "opacity-60")}
        aria-busy={consulta !== diferida}
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
        onAbiertoCambio={(abierto) => !abierto && setAEliminar(null)}
        titulo="¿Eliminar definitivamente?"
        descripcion={`«${aEliminar?.nombre ?? ""}» se borrará del almacenamiento. Esta acción no se puede deshacer.`}
        pie={
          <>
            <Boton variante="fantasma" onClick={() => setAEliminar(null)}>
              Cancelar
            </Boton>
            <Boton
              variante="peligro"
              onClick={() => {
                if (aEliminar) void ejecutar(eliminarDefinitivamente(aEliminar.id), aEliminar.id);
                setAEliminar(null);
              }}
            >
              Eliminar
            </Boton>
          </>
        }
      />
    </section>
  );
}
