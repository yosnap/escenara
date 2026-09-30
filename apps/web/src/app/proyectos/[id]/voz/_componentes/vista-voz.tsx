"use client";

import Link from "next/link";
import { useState } from "react";
import { Alerta } from "@/components/ui/alerta";
import { Boton, claseBoton } from "@/components/ui/button";
import { Casilla } from "@/components/ui/choice";
import { Aviso, EstadoVacio } from "@/components/ui/feedback";
import { Dialogo } from "@/components/ui/overlay";
import { avisosConfirmables, bloqueosDeControles } from "@/lib/controles";
import { formatearCreditos } from "@/lib/generacion";
import type { ModoVoz, ParametrosVoz, Subtitulo, VozProyectoVista } from "@/lib/voz";
import {
  anadirMusica,
  type ConfirmacionVozEnvio,
  cambiarVolumen,
  fijarModo,
  fijarVozDelProyecto,
  generarVoz,
  guardarSubtitulos,
  pedirMuestra,
  proponerSubtitulos,
  quitarMusica,
  type Resultado,
  registrarVozOmni,
  transcribir,
} from "./api-voz";
import { PanelMusica } from "./panel-musica";
import { PanelVozProyecto } from "./panel-voz-proyecto";
import { TarjetaEscenaVoz } from "./tarjeta-escena-voz";

/**
 * Voz y subtítulos de un proyecto (RF08, 0.21.0).
 *
 * Aquí **no hay sondeo ni cálculos propios**: cada acción devuelve el estado completo del servidor y se adopta tal
 * cual, así que lo que se ve nunca es una suposición del navegador (en Escenara no se usa `useEffect` directo).
 *
 * Y **nada gasta sin confirmación**: generar la voz de una escena o pedir una muestra abren el diálogo de coste con
 * los créditos estimados y una clave nueva por confirmación, que es lo que impide que un doble clic pague dos veces.
 */
export function VistaVoz({ inicial }: { inicial: VozProyectoVista }) {
  const [estado, setEstado] = useState(inicial);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [gasto, setGasto] = useState<PendienteDeGasto | null>(null);
  const [invalidacion, setInvalidacion] = useState<PendienteDeInvalidar | null>(null);
  const [sobrescribir, setSobrescribir] = useState<PendienteDeSobrescribir | null>(null);
  const [umbral, setUmbral] = useState(false);
  /**
   * Avisos salvables del motor que el usuario ha confirmado. Van en la misma petición que el gasto, porque es el
   * servidor quien los exige: sin esta casilla, un aviso confirmable dejaba la voz bloqueada sin ninguna salida.
   */
  const [confirmados, setConfirmados] = useState<string[]>([]);
  const avisos = avisosConfirmables(estado.disponibilidad.controles);
  const bloqueos = bloqueosDeControles(estado.disponibilidad.controles, confirmados);

  const ejecutar = async (accion: () => Promise<Resultado<VozProyectoVista>>) => {
    setOcupado(true);
    setError(null);
    setAviso(null);
    const resultado = await accion();
    setOcupado(false);
    if (resultado.ok) setEstado(resultado.datos);
    else setError(resultado.error);
  };

  /**
   * Cambiar el modo o la voz puede invalidar escenas ya pagadas. El servidor lo rechaza con su motivo hasta que se
   * confirma, así que el primer intento va **sin** confirmar a propósito: es el servidor quien decide si hace falta
   * pedirla, y no el navegador adivinándolo.
   */
  const cambiar = async (pendiente: PendienteDeInvalidar, confirmar: boolean) => {
    setOcupado(true);
    setError(null);
    setAviso(null);
    const resultado = await (pendiente.tipo === "modo"
      ? fijarModo(estado.proyectoId, pendiente.modo, confirmar)
      : pendiente.tipo === "voz-omni"
        ? registrarVozOmni(estado.proyectoId, pendiente, confirmar)
        : fijarVozDelProyecto(estado.proyectoId, pendiente.voz, pendiente.parametros, confirmar));
    setOcupado(false);
    if (resultado.ok) {
      setEstado(resultado.datos);
      setInvalidacion(null);
      return;
    }
    if (!confirmar) {
      // El servidor dice qué invalida: se le muestra al usuario y se espera su confirmación.
      setInvalidacion({ ...pendiente, motivo: resultado.error });
      return;
    }
    setInvalidacion(null);
    setError(resultado.error);
  };

  /**
   * Transcribir o proponer sustituye los subtítulos por completo. El primer intento va **sin** confirmar a
   * propósito: es el servidor quien sabe si esa escena tiene subtítulos corregidos a mano, y no el navegador
   * adivinándolo con una copia de la misma regla.
   */
  const sustituirSubtitulos = async (pendiente: PendienteDeSobrescribir, confirmar: boolean) => {
    setOcupado(true);
    setError(null);
    setAviso(null);
    const resultado = await (pendiente.tipo === "transcribir"
      ? transcribir(estado.proyectoId, pendiente.escenaId, confirmar)
      : proponerSubtitulos(estado.proyectoId, pendiente.escenaId, confirmar));
    setOcupado(false);
    if (resultado.ok) {
      setEstado(resultado.datos);
      setSobrescribir(null);
      return;
    }
    if (!confirmar) {
      setSobrescribir({ ...pendiente, motivo: resultado.error });
      return;
    }
    setSobrescribir(null);
    setError(resultado.error);
  };

  const confirmarGasto = async () => {
    if (!gasto) return;
    const confirmacion: ConfirmacionVozEnvio = {
      creditosConfirmados: gasto.creditos,
      selloEstimacion: estado.disponibilidad.sello,
      // Clave nueva por confirmación: repetirla no cobra dos veces, y cada confirmación es un gasto distinto.
      claveIdempotencia: crypto.randomUUID(),
      avisoUmbralAceptado: umbral,
      avisosConfirmados: confirmados,
    };
    setGasto(null);
    setUmbral(false);
    if (gasto.tipo === "escena") {
      await ejecutar(() => generarVoz(estado.proyectoId, gasto.escenaId, confirmacion));
      setAviso("La voz de la escena está en marcha. Cuando termine aparecerá aquí al recargar.");
      return;
    }
    setOcupado(true);
    setError(null);
    const resultado = await pedirMuestra(gasto.voz, gasto.parametros, confirmacion);
    setOcupado(false);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    setAviso(
      resultado.datos.medio
        ? "Ya tenías esa muestra pagada: no se ha gastado nada."
        : "La muestra está en marcha. Cuando termine aparecerá aquí al recargar.",
    );
  };

  const creditos = estado.disponibilidad.creditosPorEscena;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={`/proyectos/${estado.proyectoId}/produccion`}
            className="text-sm font-semibold text-acento hover:underline"
          >
            ← La producción del proyecto
          </Link>
          <h1 className="mt-1 text-4xl font-bold text-texto">Voz y subtítulos: {estado.titulo}</h1>
          <p className="mt-2 text-texto-suave">
            {estado.escenas.length} {estado.escenas.length === 1 ? "escena" : "escenas"}
            {estado.porRegenerar > 0 ? ` · ${estado.porRegenerar} con la voz o los subtítulos invalidados` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/api/proyectos/${estado.proyectoId}/voz/subtitulos?formato=srt`}
            className={claseBoton("secundario", "sm")}
          >
            Descargar SRT
          </a>
          <a
            href={`/api/proyectos/${estado.proyectoId}/voz/subtitulos?formato=vtt`}
            className={claseBoton("secundario", "sm")}
          >
            Descargar WebVTT
          </a>
        </div>
      </div>

      {error && <Aviso tono="error">{error}</Aviso>}
      {aviso && <Aviso tono="info">{aviso}</Aviso>}

      {estado.porRegenerar > 0 && (
        <Aviso tono="error">
          {estado.porRegenerar} {estado.porRegenerar === 1 ? "escena tiene" : "escenas tienen"} la voz o los subtítulos
          invalidados.{" "}
          {estado.costeRegenerar === null
            ? estado.motivoSinCoste
            : estado.costeRegenerar === 0
              ? "Volver a sacar sus subtítulos no cuesta nada: el transcriptor es local."
              : `Regenerarlas costaría ${formatearCreditos(estado.costeRegenerar)} estimados en total, y se confirma escena a escena: nada se regenera solo.`}
        </Aviso>
      )}

      <PanelVozProyecto
        estado={estado}
        ocupado={ocupado}
        onModo={(modo) => cambiar({ tipo: "modo", modo }, false)}
        onVoz={(voz, parametros) => cambiar({ tipo: "voz", voz, parametros }, false)}
        onVozOmni={(voz, descripcion, ejemplo) => cambiar({ tipo: "voz-omni", voz, descripcion, ejemplo }, false)}
        onMuestra={(voz, parametros) => {
          if (creditos === null) return;
          setGasto({ tipo: "muestra", voz, parametros, creditos });
        }}
      />

      {estado.escenas.length === 0 ? (
        <EstadoVacio
          nivel={2}
          titulo="Este proyecto todavía no tiene escenas"
          texto="Escribe su guion en el plan del proyecto y vuelve aquí para ponerle voz y subtítulos."
        />
      ) : (
        estado.escenas.map((escena) => (
          <TarjetaEscenaVoz
            key={escena.id}
            escena={escena}
            modo={estado.modo}
            disponibilidad={estado.disponibilidad}
            ocupado={ocupado}
            onGenerarVoz={() => {
              // Lo que se confirma es lo que cuesta **esta** escena con su diálogo, no una tarifa del proyecto.
              if (escena.creditos === null) return;
              setGasto({ tipo: "escena", escenaId: escena.id, orden: escena.orden, creditos: escena.creditos });
            }}
            onTranscribir={() => sustituirSubtitulos({ tipo: "transcribir", escenaId: escena.id }, false)}
            onProponer={() => sustituirSubtitulos({ tipo: "proponer", escenaId: escena.id }, false)}
            onGuardar={(subtitulos: Subtitulo[]) =>
              ejecutar(() => guardarSubtitulos(estado.proyectoId, escena.id, subtitulos))
            }
          />
        ))
      )}

      <PanelMusica
        musica={estado.musica}
        ocupado={ocupado}
        onAnadir={(medioId, nota, volumen) => ejecutar(() => anadirMusica(estado.proyectoId, medioId, nota, volumen))}
        onQuitar={(pistaId) => ejecutar(() => quitarMusica(estado.proyectoId, pistaId))}
        onVolumen={(pistaId, volumen) => ejecutar(() => cambiarVolumen(estado.proyectoId, pistaId, volumen))}
      />

      {/* Confirmación del gasto. Zona de claridad: la cifra en créditos, etiquetada como estimación, sin adornos. */}
      <Dialogo
        abierto={gasto !== null}
        onAbiertoCambio={(abierto) => {
          if (!abierto) {
            setGasto(null);
            setUmbral(false);
          }
        }}
        titulo={
          gasto?.tipo === "muestra"
            ? "Oír una muestra de esta voz"
            : `Generar la voz de la escena ${gasto?.tipo === "escena" ? gasto.orden : ""}`
        }
        descripcion="Esta llamada cuesta créditos de tu cuenta del proveedor. No se envía nada hasta que lo confirmes."
        pie={
          <div className="flex flex-wrap justify-end gap-2">
            <Boton variante="secundario" onClick={() => setGasto(null)}>
              No, cancelar
            </Boton>
            <Boton disabled={ocupado || bloqueos.length > 0} onClick={confirmarGasto}>
              Sí, gastar {gasto ? formatearCreditos(gasto.creditos) : ""}
            </Boton>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-texto">
            Coste estimado: <strong>{gasto ? formatearCreditos(gasto.creditos) : ""}</strong>. Es una estimación con el
            precio registrado del modelo, no un importe final: lo que se apunta es lo que informe el proveedor.
          </p>
          {gasto?.tipo === "muestra" && (
            <p className="text-sm text-texto-suave">
              Se paga una sola vez por voz y por estos parámetros: después queda guardada y volver a oírla no cuesta
              nada.
            </p>
          )}
          <Casilla
            etiqueta="Sé que esto gasta créditos de mi cuenta del proveedor"
            marcada={umbral}
            onCambio={setUmbral}
          />
          {/* Un aviso salvable del motor se confirma **aquí**, junto al botón que gasta: es donde el servidor lo
              va a pedir, y sin esta casilla no habría forma de dársela. */}
          {avisos.map((avisoControl) => (
            <Casilla
              key={avisoControl.regla}
              etiqueta="Lo he leído y quiero generar igualmente"
              descripcion={`${avisoControl.motivo} ${avisoControl.accion}`}
              marcada={confirmados.includes(avisoControl.regla)}
              onCambio={(valor) =>
                setConfirmados((previos) =>
                  valor
                    ? [...new Set([...previos, avisoControl.regla])]
                    : previos.filter((regla) => regla !== avisoControl.regla),
                )
              }
            />
          ))}
          {bloqueos.length > 0 && (
            <Alerta
              tipo="bloqueo"
              compacta
              anuncio="ninguno"
              protege
              elementos={bloqueos.map((texto) => ({ texto }))}
            />
          )}
        </div>
      </Dialogo>

      {/* Confirmación de un cambio que invalida lo ya generado. No se cobra nada aquí y no se regenera nada. */}
      <Dialogo
        abierto={invalidacion !== null}
        onAbiertoCambio={(abierto) => {
          if (!abierto) setInvalidacion(null);
        }}
        titulo="Este cambio invalida lo que ya está generado"
        pie={
          <div className="flex flex-wrap justify-end gap-2">
            <Boton variante="secundario" onClick={() => setInvalidacion(null)}>
              No, dejarlo como está
            </Boton>
            <Boton
              disabled={ocupado}
              onClick={() => {
                if (invalidacion) void cambiar(invalidacion, true);
              }}
            >
              Sí, aplicar el cambio
            </Boton>
          </div>
        }
      >
        <p className="text-texto">{invalidacion?.motivo}</p>
      </Dialogo>

      {/* Sustituir unos subtítulos corregidos a mano. No cuesta nada, pero lo editado no está en ningún otro sitio. */}
      <Dialogo
        abierto={sobrescribir !== null}
        onAbiertoCambio={(abierto) => {
          if (!abierto) setSobrescribir(null);
        }}
        titulo="Esto sustituye unos subtítulos que has corregido"
        pie={
          <div className="flex flex-wrap justify-end gap-2">
            <Boton variante="secundario" onClick={() => setSobrescribir(null)}>
              No, conservar los míos
            </Boton>
            <Boton
              disabled={ocupado}
              onClick={() => {
                if (sobrescribir) void sustituirSubtitulos(sobrescribir, true);
              }}
            >
              Sí, sustituirlos
            </Boton>
          </div>
        }
      >
        <p className="text-texto">{sobrescribir?.motivo}</p>
      </Dialogo>
    </>
  );
}

/** Gasto pendiente de confirmar: la voz de una escena o la muestra de una voz. */
type PendienteDeGasto =
  | { tipo: "escena"; escenaId: string; orden: number; creditos: number }
  | { tipo: "muestra"; voz: string; parametros: ParametrosVoz; creditos: number };

/** Sustitución de subtítulos pendiente de confirmar porque pisaría lo que corrigió una persona. */
type PendienteDeSobrescribir = { tipo: "transcribir" | "proponer"; escenaId: string; motivo?: string };

/** Cambio pendiente de confirmar porque invalida lo generado. `motivo` lo escribe el servidor. */
type PendienteDeInvalidar =
  | { tipo: "modo"; modo: ModoVoz; motivo?: string }
  | { tipo: "voz"; voz: string; parametros: ParametrosVoz; motivo?: string }
  /** Registro de la voz Omni (0.22.0): no cuesta créditos, pero invalida lo que salió con la anterior. */
  | { tipo: "voz-omni"; voz: string; descripcion: string; ejemplo: string; motivo?: string };
