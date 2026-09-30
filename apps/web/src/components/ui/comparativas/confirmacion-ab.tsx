"use client";

import { GitCompareArrows } from "lucide-react";
import { useId, useRef, useState } from "react";
import {
  claveDeConfirmacion,
  desgloseAB,
  type EstimacionAlternativa,
  MAXIMO_ALTERNATIVAS,
  type PeticionAB,
  type PreparacionAB,
} from "@/lib/comparativas";
import { formatearCreditos } from "@/lib/generacion";
import type { Problema } from "@/lib/llevar-al-problema";
import { exigeAvisoDeGasto } from "@/lib/produccion";
import { Alerta } from "../alerta";
import { Boton } from "../button";
import { Casilla } from "../choice";

/**
 * Elegir dos modelos y confirmar la comparativa A/B, en **zona de claridad**: el desglose (cuántas ejecuciones, cuánto
 * cada una y el total) es exactamente lo que se envía al servidor, y hay que confirmarlo expresamente con su propia
 * casilla, además de las de siempre (derechos, fotos del personaje, marca y aviso de gasto alto).
 *
 * Cada confirmación lleva su propia clave: mientras no cambie lo que se confirma, repetir el clic manda la misma y el
 * servidor devuelve la comparativa que ya creó en lugar de encargar otra.
 */
export function ConfirmacionAB({
  preparacion,
  elegidos,
  onElegidos,
  estimacion,
  cargandoEstimacion,
  ocupado,
  intento = 0,
  onEnviar,
}: {
  preparacion: PreparacionAB;
  elegidos: readonly string[];
  onElegidos: (modelos: string[]) => void;
  /** Estimación de los dos elegidos; `null` mientras no hay dos o se está pidiendo. */
  estimacion: readonly EstimacionAlternativa[] | null;
  cargandoEstimacion: boolean;
  ocupado: boolean;
  /** Sube tras un error del servidor: la siguiente confirmación lleva clave nueva (ver `claveDeConfirmacion`). */
  intento?: number;
  onEnviar: (peticion: PeticionAB) => void;
}) {
  const [derechos, setDerechos] = useState(false);
  const [sinTerceros, setSinTerceros] = useState(false);
  const [derechoMarca, setDerechoMarca] = useState(false);
  const [avisoAceptado, setAvisoAceptado] = useState(false);
  const [desglose, setDesglose] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const clave = useRef<{ firma: string; valor: string } | null>(null);
  const base = useId();
  const casilla = (n: string) => `${base}-${n}`;

  const lista = estimacion ?? [];
  const texto = estimacion ? desgloseAB(lista) : "";
  const total = lista.reduce((s, a) => s + a.creditos, 0);
  const superaUmbral = lista.some((a) => exigeAvisoDeGasto(a.creditos, preparacion.umbralAvisoCreditos));
  const impedimentosModelo = lista.flatMap((a) => (a.impedimento ? [a.impedimento] : []));
  const confirmado = desglose !== null && desglose === texto;

  const impedimentos: Problema[] = [
    ...preparacion.impedimentos.map((t) => ({ texto: t })),
    ...impedimentosModelo.map((t) => ({ texto: t })),
    ...(elegidos.length < MAXIMO_ALTERNATIVAS ? [{ texto: "Elige dos modelos para comparar." }] : []),
    ...(estimacion && !confirmado
      ? [{ id: casilla("desglose"), texto: "Falta confirmar el número de ejecuciones y el coste total." }]
      : []),
    ...(derechos ? [] : [{ id: casilla("derechos"), texto: "Falta confirmar que tienes derecho a usar la imagen." }]),
    ...(!preparacion.conPersonaje || sinTerceros
      ? []
      : [{ id: casilla("sin-terceros"), texto: "Falta confirmar la revisión de las fotos del personaje." }]),
    ...(!preparacion.conProducto || derechoMarca
      ? []
      : [{ id: casilla("marca"), texto: "Falta confirmar que tienes derecho a usar la marca del producto." }]),
    ...(!superaUmbral || avisoAceptado
      ? []
      : [{ id: casilla("aviso-gasto"), texto: "Falta aceptar el aviso de gasto alto." }]),
  ];

  const alternar = (modelo: string, valor: boolean) => {
    setDesglose(null);
    onElegidos(valor ? [...elegidos, modelo].slice(0, MAXIMO_ALTERNATIVAS) : elegidos.filter((m) => m !== modelo));
  };

  const enviar = () => {
    if (!estimacion) return;
    const firma = `${texto}|${avisos.join(",")}|${lista.map((a) => a.sello).join(",")}`;
    clave.current = claveDeConfirmacion(clave.current, firma, intento, () => crypto.randomUUID());
    onEnviar({
      alternativas: lista.map((a) => ({ modelo: a.modelo, creditos: a.creditos, sello: a.sello })),
      ejecucionesConfirmadas: lista.length,
      creditosTotalesConfirmados: total,
      derechos,
      derechoMarca,
      sinTerceros,
      avisoUmbralAceptado: avisoAceptado,
      avisosConfirmados: avisos,
      claveIdempotencia: clave.current.valor,
    });
  };

  return (
    <div className="flex flex-col gap-4 rounded-tarjeta border-2 border-borde bg-superficie p-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-lg font-bold text-texto">
          Elige {MAXIMO_ALTERNATIVAS} modelos de vídeo ({elegidos.length} de {MAXIMO_ALTERNATIVAS})
        </legend>
        {preparacion.disponibles.map((d) => (
          <Casilla
            key={d.modelo}
            etiqueta={`${d.nombre} · ${d.nombreProveedor}`}
            descripcion={
              d.creditos === null ? "Sin precio registrado" : `${formatearCreditos(d.creditos)} por clip en el catálogo`
            }
            marcada={elegidos.includes(d.modelo)}
            deshabilitado={!elegidos.includes(d.modelo) && elegidos.length >= MAXIMO_ALTERNATIVAS}
            onCambio={(v) => alternar(d.modelo, v)}
          />
        ))}
      </fieldset>

      {cargandoEstimacion && <p className="text-sm text-texto-suave">Calculando el coste con el catálogo…</p>}

      {estimacion && (
        <div className="flex flex-col gap-2">
          <p className="font-mono text-lg font-bold text-texto">
            {lista.length} ejecuciones · {formatearCreditos(total)} (estimación)
          </p>
          <ul className="text-sm text-texto-suave">
            {lista.map((a) => (
              <li key={a.modelo}>
                {a.nombre}: {formatearCreditos(a.creditos)}
                {a.segundos ? ` por un clip de ${a.segundos} s` : ""}, precio comprobado el {a.comprobado}
                {a.precioAntiguo ? " (antiguo)" : ""}
              </li>
            ))}
          </ul>
          <Casilla
            etiqueta={`Confirmo ${lista.length} ejecuciones por ${formatearCreditos(total)} en total`}
            descripcion={texto}
            marcada={confirmado}
            onCambio={(v) => setDesglose(v ? texto : null)}
            requisito={casilla("desglose")}
          />
        </div>
      )}

      <Casilla
        etiqueta="Tengo derecho a usar esta imagen"
        descripcion="Es tuya o tienes permiso de quien aparece en ella. Para generar, el fotograma se sube temporalmente al almacenamiento del proveedor."
        marcada={derechos}
        onCambio={setDerechos}
        requisito={casilla("derechos")}
      />
      {preparacion.conPersonaje && (
        <Casilla
          etiqueta="En las fotos del personaje no aparece nadie más ni ningún menor"
          descripcion="Lo revisas tú antes de enviarlas. Tu confirmación queda registrada con su fecha."
          marcada={sinTerceros}
          onCambio={setSinTerceros}
          requisito={casilla("sin-terceros")}
        />
      )}
      {preparacion.conProducto && (
        <Casilla
          etiqueta="Tengo derecho a usar esta marca"
          descripcion="El producto es tuyo o tienes autorización de la marca para usarlo en este vídeo."
          marcada={derechoMarca}
          onCambio={setDerechoMarca}
          requisito={casilla("marca")}
        />
      )}
      {preparacion.avisos.map((aviso) => (
        <Casilla
          key={aviso.regla}
          etiqueta="Lo he leído y quiero generar igualmente"
          descripcion={aviso.motivo}
          marcada={avisos.includes(aviso.regla)}
          onCambio={(v) => setAvisos((a) => (v ? [...a, aviso.regla] : a.filter((r) => r !== aviso.regla)))}
        />
      ))}
      {superaUmbral && (
        <Casilla
          etiqueta={`Sé que alguna ejecución pasa de ${formatearCreditos(preparacion.umbralAvisoCreditos)}`}
          descripcion="Aviso de gasto alto de esta instalación: hay que aceptarlo expresamente antes de enviarlo."
          marcada={avisoAceptado}
          onCambio={setAvisoAceptado}
          requisito={casilla("aviso-gasto")}
        />
      )}
      {impedimentos.length > 0 && <Alerta tipo="bloqueo" compacta anuncio="ninguno" protege elementos={impedimentos} />}
      <Boton
        variante="chispa"
        icono={<GitCompareArrows className="size-5" />}
        className="self-start"
        cargando={ocupado}
        disabled={impedimentos.length > 0 || !estimacion || total <= 0}
        onClick={enviar}
      >
        Comparar generando
      </Boton>
      <p className="text-sm text-texto-suave">
        Son las dos ejecuciones o ninguna: si una no cabe, no sale ninguna y no se cobra nada. Cada ejecución es un clip
        normal: pasa por la cola con tu presupuesto y se paga con tu propia clave. El importe final lo decide el
        proveedor; Escenara estima con el precio que tiene registrado.
      </p>
    </div>
  );
}
