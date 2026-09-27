"use client";

import { Camera, CheckCircle2, CircleDashed, Sparkles, Tags, WandSparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Boton, claseBoton } from "@/components/ui/button";
import { Aviso, AvisoEstado } from "@/components/ui/feedback";
import { Dialogo } from "@/components/ui/overlay";
import { consultarEstimacionDeVista } from "@/components/ui/personajes/api-personajes";
import { MarcoEnfoque } from "@/components/ui/personajes/marco-enfoque";
import { VisorCaptura } from "@/components/ui/personajes/visor-captura";
import {
  type Cobertura,
  type CoberturaVista,
  ETIQUETA_VISTA,
  INDICACION_VISTA,
  type UmbralesCalidad,
  type Vista,
} from "@/lib/captura-personaje";
import type { Estimacion } from "@/lib/generacion";
import type { PersonajeVista } from "@/lib/personajes";
import { DialogoVistaSintetica } from "./dialogo-vista-sintetica";
import { ANCLA_REFERENCIAS } from "./panel-referencias";

/**
 * Panel de cobertura (RF03): qué vistas tiene el personaje, cuál falta y qué hacer con la que falta. Es el
 * sitio desde el que se entra a la captura guiada y, solo cuando una vista falta, desde el que se puede
 * generar una vista sintética con su coste confirmado.
 *
 * Las vistas generadas se cuentan **aparte** de las fotos: la cifra que sostiene el mínimo del personaje es la
 * de fotos originales, y aquí se dice así con todas las letras.
 */
/** Si se puede generar con la clave del usuario, y si no, por qué. Lo resuelve el servidor en la página. */
export type EstadoDeClave = { ok: true } | { ok: false; motivo: string };

export function PanelCobertura({
  personaje,
  umbrales,
  claveDeGeneracion,
  onPersonaje,
  onVistaEncolada,
}: {
  personaje: PersonajeVista;
  /** Sin clave utilizable no se ofrece generar ninguna vista: se dice qué falta y se enlaza «Tu cuenta». */
  claveDeGeneracion: EstadoDeClave;
  /** Umbrales del control de calidad, tal como están en Admin › Ajustes. */
  umbrales: UmbralesCalidad;
  /** Personaje recalculado por el servidor tras añadir una referencia. */
  onPersonaje: (personaje: PersonajeVista) => void;
  /** Vista cuya generación se ha encolado, para que la ficha lo diga. */
  onVistaEncolada: (vista: Vista) => void;
}) {
  const cobertura: Cobertura | undefined = personaje.cobertura;
  const [capturando, setCapturando] = useState<Vista | null>(null);
  const [generando, setGenerando] = useState<{ vista: Vista; estimacion: Estimacion } | null>(null);
  const [pidiendo, setPidiendo] = useState<Vista | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!cobertura) return null;

  /** Pide el coste antes de abrir el diálogo: nunca se muestra un precio inventado en el navegador. */
  const abrirGeneracion = async (vista: Vista) => {
    setPidiendo(vista);
    setError(null);
    const respuesta = await consultarEstimacionDeVista();
    setPidiendo(null);
    if (!respuesta.ok) {
      setError(respuesta.error);
      return;
    }
    setGenerando({ vista, estimacion: respuesta.datos });
  };

  return (
    <section aria-label="Cobertura de vistas" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-2xl font-bold text-texto">Vistas del personaje</h2>
        <p className="text-sm text-texto-suave">
          {cobertura.faltan.length === 0
            ? "Todas las vistas cubiertas"
            : `Faltan ${cobertura.faltan.length} de ${cobertura.vistas.length}`}
          {personaje.totalGeneradas > 0 &&
            ` · ${personaje.totalGeneradas} ${personaje.totalGeneradas === 1 ? "vista generada" : "vistas generadas"} (no cuentan como foto)`}
        </p>
      </div>

      <p className="text-sm text-texto-suave">
        Con estas vistas el parecido se mantiene entre fotogramas. La cobertura es una guía: lo que decide si el
        personaje puede generar es el mínimo de {personaje.minimoReferencias} fotos originales.
      </p>

      {error && <Aviso tono="error">{error}</Aviso>}

      {!claveDeGeneracion.ok && cobertura.faltan.length > 0 && (
        <AvisoEstado
          estado="bloqueado"
          motivo={`${claveDeGeneracion.motivo} Hacer las fotos no necesita ninguna clave y funciona igual.`}
          accion={
            <Link href="/cuenta" className={claseBoton("primario", "sm")}>
              Ir a Tu cuenta
            </Link>
          }
        />
      )}

      {/* Antes de proponer hacer otra foto o —peor— generar una de pago: puede que la vista que falta ya esté
          entre las fotos que el usuario subió y nadie ha clasificado todavía. */}
      {cobertura.sinClasificar > 0 && cobertura.faltan.length > 0 && (
        <AvisoEstado
          estado="ajustes"
          motivo={
            cobertura.sinClasificar === 1
              ? "Tienes 1 foto sin clasificar: dinos qué vista es antes de hacer otra o de generar ninguna. Puede que la vista que falta ya la tengas."
              : `Tienes ${cobertura.sinClasificar} fotos sin clasificar: dinos qué vista es cada una antes de hacer otra o de generar ninguna. Puede que las vistas que faltan ya las tengas.`
          }
          accion={
            <Boton
              tamano="sm"
              icono={<Tags className="size-4" />}
              onClick={() =>
                document.getElementById(ANCLA_REFERENCIAS)?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
            >
              Clasificar mis fotos
            </Boton>
          }
        />
      )}

      <ul className="grid gap-3 sm:grid-cols-[repeat(auto-fill,minmax(13rem,1fr))]">
        {cobertura.vistas.map((v) => (
          <li key={v.vista}>
            <TarjetaVista
              vista={v}
              sinClasificar={cobertura.sinClasificar}
              conClave={claveDeGeneracion.ok}
              ocupado={pidiendo !== null}
              onCapturar={() => setCapturando(v.vista)}
              onGenerar={() => void abrirGeneracion(v.vista)}
              generando={pidiendo === v.vista}
            />
          </li>
        ))}
      </ul>

      {cobertura.sinClasificar > 0 && (
        <p className="text-sm text-texto-suave">
          {cobertura.sinClasificar === 1
            ? "Hay 1 foto sin vista asignada: cuenta para el mínimo, pero no cubre ninguna vista. Puedes decir qué vista es en «Fotos de referencia»."
            : `Hay ${cobertura.sinClasificar} fotos sin vista asignada: cuentan para el mínimo, pero no cubren ninguna vista. Puedes decir qué vista es cada una en «Fotos de referencia».`}
        </p>
      )}

      {capturando && (
        <Dialogo
          titulo={`Hacer la foto de «${ETIQUETA_VISTA[capturando].toLowerCase()}»`}
          descripcion={INDICACION_VISTA[capturando]}
          abierto
          onAbiertoCambio={(abierto) => {
            if (!abierto) setCapturando(null);
          }}
        >
          <VisorCaptura
            personajeId={personaje.id}
            tipo={personaje.tipo}
            vista={capturando}
            umbrales={umbrales}
            onAnadida={(actualizado) => {
              onPersonaje(actualizado);
              setCapturando(null);
            }}
          />
        </Dialogo>
      )}

      {generando && (
        <DialogoVistaSintetica
          personajeId={personaje.id}
          vista={generando.vista}
          estimacion={generando.estimacion}
          abierto
          onAbiertoCambio={(abierto) => {
            if (!abierto) setGenerando(null);
          }}
          onEncolada={() => {
            onVistaEncolada(generando.vista);
            setGenerando(null);
          }}
        />
      )}
    </section>
  );
}

function TarjetaVista({
  vista,
  sinClasificar,
  conClave,
  onCapturar,
  onGenerar,
  ocupado,
  generando,
}: {
  vista: CoberturaVista;
  /** Cuántas fotos del personaje están sin clasificar: puede que esta vista ya esté entre ellas. */
  sinClasificar: number;
  /** `false` cuando no hay clave utilizable del proveedor: entonces no se ofrece generar la vista. */
  conClave: boolean;
  onCapturar: () => void;
  onGenerar: () => void;
  ocupado: boolean;
  generando: boolean;
}) {
  const cubierta = vista.originales > 0;
  return (
    <div className="flex h-full flex-col gap-3 rounded-tarjeta border-2 border-borde bg-superficie p-3">
      <MarcoEnfoque vista={vista.vista} className="w-full" />
      <div className="flex flex-col gap-1">
        <p className="flex items-center gap-2 font-semibold text-texto">
          <span aria-hidden className={cubierta ? "text-correcto" : "text-aviso"}>
            {cubierta ? <CheckCircle2 className="size-4" /> : <CircleDashed className="size-4" />}
          </span>
          {vista.etiqueta}
        </p>
        <p className="text-sm text-texto-suave">
          {cubierta
            ? `${vista.originales} ${vista.originales === 1 ? "foto" : "fotos"}`
            : vista.generadas > 0
              ? "Solo hay una vista generada: no cuenta como foto"
              : "Falta"}
          {cubierta && vista.generadas > 0 && ` · ${vista.generadas} generada${vista.generadas === 1 ? "" : "s"}`}
        </p>
        {!cubierta && sinClasificar > 0 && (
          <p className="text-sm text-texto-suave">
            Puede que ya la tengas: {sinClasificar === 1 ? "hay 1 foto" : `hay ${sinClasificar} fotos`} sin clasificar.
          </p>
        )}
        {!cubierta && <p className="text-sm text-texto-suave">{vista.indicacion}</p>}
      </div>
      <div className="mt-auto flex flex-wrap gap-2">
        <Boton tamano="sm" icono={<Camera className="size-4" />} onClick={onCapturar} disabled={ocupado}>
          {cubierta ? "Otra foto" : "Hacer la foto"}
        </Boton>
        {!cubierta && vista.generadas === 0 && conClave && (
          <Boton
            tamano="sm"
            variante="secundario"
            icono={generando ? <Sparkles className="size-4" /> : <WandSparkles className="size-4" />}
            cargando={generando}
            disabled={ocupado && !generando}
            onClick={onGenerar}
          >
            Generarla
          </Boton>
        )}
      </div>
    </div>
  );
}
