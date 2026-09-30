"use client";

import { ChevronDown, ChevronUp, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { Boton, BotonIcono } from "@/components/ui/button";
import { Aviso } from "@/components/ui/feedback";
import { ResumenDeLoPedido, ZonaDeConsentimiento } from "@/components/ui/reparto";
import { Selector } from "@/components/ui/select";
import { formatearCreditos } from "@/lib/generacion";
import type { PersonajeElegible } from "@/lib/personajes";
import {
  AYUDA_FORMATO_REPARTO,
  ETIQUETA_FORMATO_REPARTO,
  ETIQUETA_LADO_REPARTO,
  ETIQUETA_MIRADA_REPARTO,
  ETIQUETA_PAPEL_REPARTO,
  esFormatoDeDos,
  FORMATOS_REPARTO,
  LADOS_REPARTO,
  MAXIMO_PERSONAJES_REPARTO,
  MIRADAS_REPARTO,
  PAPELES_REPARTO,
} from "@/lib/reparto";
import {
  detalleDeLaEstimacion,
  faltasDelReparto,
  formatoDisponible,
  frasesDeLoPedido,
  motivoFormatoApagado,
} from "@/lib/reparto-pantalla";
import type { RepartoDePantalla } from "@/server/reparto/pantalla";
import {
  anadirPersonaje,
  cambiarPersonaje,
  elegirFormato,
  leerRepartoDePantalla,
  quitarPersonaje,
  repartirDialogo,
  type TurnoPedido,
} from "./api-reparto";
import { EditorTurnos } from "./editor-turnos";

/**
 * **Dos personajes en una escena** (0.28.0): el formato, quién sale por cada lado, el diálogo repartido por turnos
 * y —antes de pagar nada— lo que se ha pedido contado en castellano.
 *
 * Tres cosas gobiernan este panel:
 *
 * - una escena de **un** personaje se queda exactamente como estaba antes de esta versión: el panel se abre, dice
 *   que hay un personaje y no ofrece nada que gaste;
 * - **el prompt no se enseña** (ADR-0022), así que lo que se previsualiza es una descripción escrita en castellano
 *   de lo que se va a pedir: quién a la izquierda, quién a la derecha, quién habla y qué hace el otro;
 * - **el consentimiento se mira por persona**, en zona de claridad: con dos personas reales hacen falta dos, y aquí
 *   se dice **quién** falta y qué hacer, con las mismas palabras con las que el servidor va a cerrar la puerta.
 *
 * Los datos se leen **al abrir la sección** y se vuelven a leer después de cada cambio: nunca desde un efecto, que
 * en Escenara no se usan (regla del proyecto). Ninguna de estas lecturas gasta un crédito.
 */
export function PanelReparto({
  escenaId,
  personajes,
  deshabilitado,
  inicial = null,
  onError,
}: {
  escenaId: string;
  /** Personajes propios entre los que elegir el segundo. Como mucho se reparten dos. */
  personajes: readonly PersonajeElegible[];
  /** `true` cuando la escena ya está producida o hay algo en vuelo: el reparto no se toca a media generación. */
  deshabilitado: boolean;
  /** Datos ya leídos por quien monta el panel; si no hay, se leen al abrirlo. */
  inicial?: RepartoDePantalla | null;
  onError: (mensaje: string) => void;
}) {
  const [datos, setDatos] = useState<RepartoDePantalla | null>(inicial);
  const [abierto, setAbierto] = useState(inicial !== null);
  const [ocupado, setOcupado] = useState(false);
  const [elegido, setElegido] = useState<string | null>(null);

  /** Vuelve a leer todo del servidor: lo que cambia al tocar el reparto es el reparto **y** lo que costaría. */
  const recargar = async () => {
    const respuesta = await leerRepartoDePantalla(escenaId);
    if (respuesta.ok) setDatos(respuesta.datos);
    else onError(respuesta.error);
  };

  /** Ejecuta un cambio y relee. El error que se enseña es el del servidor, con su causa. */
  const ejecutar = async (accion: () => Promise<{ ok: boolean; error?: string }>) => {
    setOcupado(true);
    const respuesta = await accion();
    if (!respuesta.ok) {
      setOcupado(false);
      onError(respuesta.error ?? "El servidor no ha dicho por qué. Vuelve a probar.");
      return;
    }
    await recargar();
    setOcupado(false);
  };

  const abrir = () => {
    const siguiente = !abierto;
    setAbierto(siguiente);
    if (siguiente && datos === null) void recargar();
  };

  const reparto = datos?.reparto ?? null;
  const activos = { podcastActivo: datos?.podcastActivo ?? false, dualcastActivo: datos?.dualcastActivo ?? false };
  const libres = personajes.filter((p) => !(reparto?.miembros ?? []).some((m) => m.personajeId === p.id));
  const faltas = faltasDelReparto(datos?.personajes ?? []);
  const turnosGuardados: TurnoPedido[] = (reparto?.turnos ?? []).map((t) => ({
    personajeId: t.personajeId,
    texto: t.texto,
    direccion: t.direccion,
  }));

  return (
    <section aria-label="Reparto de la escena" className="flex flex-col gap-3 rounded-control bg-elevada p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 font-bold text-texto">
          <Users className="size-4 text-acento" aria-hidden />
          Reparto
          {reparto && (
            <span className="font-normal text-texto-suave">· {ETIQUETA_FORMATO_REPARTO[reparto.formato]}</span>
          )}
        </h4>
        <Boton variante="secundario" tamano="sm" onClick={abrir}>
          {abierto ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          {abierto ? "Ocultar el reparto" : "Ver el reparto"}
        </Boton>
      </div>

      {!abierto && (
        <p className="text-sm text-texto-suave">
          Quién sale en esta escena y qué dice cada uno. Dos personajes pueden hablar en un mismo plano o en dos clips
          alternos. Abrirlo no gasta nada.
        </p>
      )}

      {abierto && datos === null && <p className="text-sm text-texto-suave">Leyendo el reparto…</p>}

      {abierto && datos !== null && reparto !== null && (
        <>
          <Selector
            etiqueta="Formato del reparto"
            opciones={FORMATOS_REPARTO.map((formato) => ({
              value: formato,
              label: ETIQUETA_FORMATO_REPARTO[formato],
              descripcion: AYUDA_FORMATO_REPARTO[formato],
              deshabilitada: !formatoDisponible(formato, activos),
            }))}
            valor={reparto.formato}
            deshabilitado={deshabilitado || ocupado}
            onCambio={(v) => {
              if (v && v !== reparto.formato) void ejecutar(() => elegirFormato(escenaId, v));
            }}
          />
          <p className="text-sm text-texto-suave">{AYUDA_FORMATO_REPARTO[reparto.formato]}</p>
          {FORMATOS_REPARTO.map((formato) => motivoFormatoApagado(formato, activos))
            .filter((motivo): motivo is string => motivo !== null)
            .map((motivo) => (
              <p key={motivo} className="text-sm text-texto-suave">
                {motivo}
              </p>
            ))}

          <ul className="flex flex-col gap-3">
            {reparto.miembros.map((miembro, indice) => (
              <li key={miembro.id} className="flex flex-col gap-2 rounded-control bg-superficie p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-texto">
                    {miembro.nombre}
                    <span className="ml-2 font-normal text-texto-suave">
                      {miembro.inventado ? "personaje inventado" : "persona real"}
                    </span>
                  </p>
                  {/* El primero es el personaje de la escena: quitarlo dejaría la escena sin nadie. */}
                  {indice > 0 && (
                    <BotonIcono
                      etiqueta={`Quitar a ${miembro.nombre} del reparto`}
                      disabled={deshabilitado || ocupado}
                      onClick={() => void ejecutar(() => quitarPersonaje(escenaId, miembro.id))}
                    >
                      <Trash2 className="size-5" />
                    </BotonIcono>
                  )}
                </div>
                {esFormatoDeDos(reparto.formato) && (
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Selector
                      etiqueta="Qué hace"
                      opciones={PAPELES_REPARTO.map((papel) => ({
                        value: papel,
                        label: ETIQUETA_PAPEL_REPARTO[papel],
                      }))}
                      valor={miembro.papel}
                      deshabilitado={deshabilitado || ocupado}
                      onCambio={(v) => {
                        if (v && v !== miembro.papel)
                          void ejecutar(() =>
                            cambiarPersonaje(escenaId, miembro.id, { papel: v as typeof miembro.papel }),
                          );
                      }}
                    />
                    <Selector
                      etiqueta="Dónde está"
                      opciones={LADOS_REPARTO.map((lado) => ({
                        value: lado,
                        label: ETIQUETA_LADO_REPARTO[lado],
                      }))}
                      valor={miembro.lado}
                      deshabilitado={deshabilitado || ocupado}
                      onCambio={(v) => {
                        if (v && v !== miembro.lado)
                          void ejecutar(() =>
                            cambiarPersonaje(escenaId, miembro.id, { lado: v as typeof miembro.lado }),
                          );
                      }}
                    />
                    <Selector
                      etiqueta="Adónde mira"
                      opciones={MIRADAS_REPARTO.map((mirada) => ({
                        value: mirada,
                        label: ETIQUETA_MIRADA_REPARTO[mirada],
                      }))}
                      valor={miembro.mirada}
                      deshabilitado={deshabilitado || ocupado}
                      onCambio={(v) => {
                        if (v && v !== miembro.mirada)
                          void ejecutar(() =>
                            cambiarPersonaje(escenaId, miembro.id, { mirada: v as typeof miembro.mirada }),
                          );
                      }}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>

          {esFormatoDeDos(reparto.formato) && reparto.miembros.length < MAXIMO_PERSONAJES_REPARTO && (
            <div className="flex flex-col gap-2 rounded-control bg-superficie p-3">
              <Selector
                etiqueta="El segundo personaje"
                marcador={libres.length === 0 ? "No tienes otro personaje" : "Elige uno de los tuyos"}
                opciones={libres.map((p) => ({ value: p.id, label: p.nombre }))}
                valor={elegido}
                deshabilitado={deshabilitado || ocupado || libres.length === 0}
                onCambio={setElegido}
              />
              <p className="text-sm text-texto-suave">
                Solo tus personajes, y como mucho {MAXIMO_PERSONAJES_REPARTO}. Nace al lado opuesto y, en podcast, con
                la mirada cruzada: puedes cambiarlo después.
              </p>
              <Boton
                variante="secundario"
                tamano="sm"
                className="self-start"
                disabled={deshabilitado || ocupado || elegido === null}
                onClick={() => {
                  if (elegido) void ejecutar(() => anadirPersonaje(escenaId, elegido));
                }}
              >
                Añadir al reparto
              </Boton>
            </div>
          )}

          {/*
            Zona de claridad del consentimiento: con dos personas reales hacen falta **dos** consentimientos, y sin
            los dos no se genera. Lo que se lee aquí es lo mismo que va a decir el servidor al cerrar la puerta.
          */}
          <ZonaDeConsentimiento
            faltas={faltas}
            sinFaltas={
              datos.personajes.length === 0
                ? "Esta escena todavía no tiene a nadie en el reparto."
                : "Cada persona real de esta escena tiene su consentimiento registrado."
            }
            comoArreglarlo="Se arregla en la ficha de cada personaje, en «Personajes». Sin los dos consentimientos esta escena no se genera."
          />

          {reparto.mismaVoz && (
            <Aviso tono="aviso">
              Los dos personajes usan la voz Omni registrada del proyecto y sonarán con el mismo timbre. Este formato
              todavía no admite dos voces Omni distintas; tendrás que confirmarlo antes de pagar.
            </Aviso>
          )}

          <ResumenDeLoPedido
            frases={frasesDeLoPedido(reparto)}
            nota="El texto que se le manda al modelo lo compone Escenara y va en inglés; lo que dicen los personajes va en castellano y sin traducir."
          />

          {esFormatoDeDos(reparto.formato) && (
            <EditorTurnos
              key={`${reparto.formato}:${JSON.stringify(turnosGuardados)}`}
              miembros={reparto.miembros}
              formato={reparto.formato}
              turnos={turnosGuardados}
              segundos={datos.segundos}
              deshabilitado={deshabilitado || ocupado}
              guardando={ocupado}
              onGuardar={(turnos) => void ejecutar(() => repartirDialogo(escenaId, turnos))}
            />
          )}

          {datos.estimacion !== null && datos.estimacion.creditos > 0 && (
            <div className="flex flex-col gap-1 rounded-control bg-superficie p-3">
              <p className="font-mono text-base font-bold text-texto">
                {formatearCreditos(datos.estimacion.creditos)} (estimación)
              </p>
              <p className="text-sm text-texto-suave">{detalleDeLaEstimacion(datos.estimacion)}</p>
              <p className="text-sm text-texto-suave">
                Aquí no se paga nada: el coste se confirma al producir la escena, en la pantalla de producción.
              </p>
            </div>
          )}

          {datos.estimacion?.impedimentos.map((impedimento) => (
            <Aviso key={impedimento} tono="error">
              {impedimento}
            </Aviso>
          ))}
        </>
      )}
    </section>
  );
}
