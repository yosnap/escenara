"use client";

import { Copy } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { ElectorDeAngulos, ZonaDeDeclaracion } from "@/components/ui/anuncio";
import { Boton } from "@/components/ui/button";
import { Aviso } from "@/components/ui/feedback";
import { AVISO_DECLARACION_NECESARIA } from "@/lib/anuncio";
import {
  declaracionNecesariaEn,
  firmaDeVariantes,
  motivoParaNoCrearVariantes,
  tituloDeVariante,
  totalDeVariantes,
} from "@/lib/anuncio-pantalla";
import { type ClaveConfirmacion, claveEstable } from "@/lib/asistente";
import { formatearCreditos } from "@/lib/generacion";
import type { VariantesCreadas } from "@/server/anuncio/variantes";
import { consultarVariantes, crearVariantes, type EstadoDeVariantes } from "./api-anuncio";

/**
 * **Variantes por ángulo**: proyectos hermanos del mismo producto y la misma oferta, con un ángulo cada uno.
 *
 * Tres cosas que esta pantalla tiene que dejar claras antes de que nadie pulse:
 *
 * - **qué se crea**: proyectos con su guion en borrador. Aquí no se genera ni un clip;
 * - **cuánto cuesta en total**: una llamada de texto por variante, y el total es lo que se confirma **de una vez**,
 *   no doce confirmaciones seguidas que nadie lee;
 * - **qué ángulos no se pueden pedir y por qué**: normalmente porque el grupo ya tiene un hermano con ese ángulo.
 *
 * El estado se pide **a mano** con el botón: leerlo exige el ajuste encendido y un brief completo, así que abrir la
 * pantalla no puede dar un error que nadie pidió.
 */
export function PanelDeVariantes({
  proyectoId,
  titulo,
  deshabilitado,
  onError,
}: {
  proyectoId: string;
  /** Título del proyecto de partida: con él se enseña cómo se llamará cada hermano antes de crearlo. */
  titulo: string;
  deshabilitado?: boolean;
  onError: (mensaje: string) => void;
}) {
  const [estado, setEstado] = useState<EstadoDeVariantes | null>(null);
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [declarada, setDeclarada] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [creando, setCreando] = useState(false);
  const [creadas, setCreadas] = useState<VariantesCreadas | null>(null);
  const clave = useRef<ClaveConfirmacion | null>(null);

  const cargar = async () => {
    setCargando(true);
    const resultado = await consultarVariantes(proyectoId);
    setCargando(false);
    if (!resultado.ok) {
      onError(resultado.error);
      return;
    }
    setEstado(resultado.datos);
  };

  const crear = async () => {
    if (estado === null) return;
    const total = totalDeVariantes(estado.creditosPorVariante, elegidos);
    setCreando(true);
    clave.current = claveEstable(clave.current, firmaDeVariantes(estado.sello, total, elegidos));
    const resultado = await crearVariantes(proyectoId, {
      angulos: elegidos,
      claveIdempotencia: clave.current.valor,
      creditosConfirmados: total,
      selloEstimacion: estado.sello,
      declaraVeracidad: declaracionNecesariaEn(estado.angulos, elegidos) ? declarada : undefined,
    });
    setCreando(false);
    if (!resultado.ok) {
      onError(
        resultado.red
          ? `${resultado.error} Puede que algunas variantes se hayan creado y cobrado: recarga la página antes de repetir.`
          : resultado.error,
      );
      return;
    }
    setCreadas(resultado.datos);
    setElegidos([]);
    setDeclarada(false);
    // El grupo ha cambiado: se vuelve a leer para que los hermanos nuevos salgan en la lista y dejen de ser elegibles.
    await cargar();
  };

  if (estado === null) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-texto-suave">
          Del mismo producto y la misma oferta puedes sacar un anuncio por ángulo: cada uno es un{" "}
          <strong className="text-texto">proyecto hermano</strong> con su guion. Aquí no se genera ningún vídeo.
        </p>
        <div>
          <Boton variante="secundario" cargando={cargando} disabled={deshabilitado} onClick={cargar}>
            <Copy className="size-4" />
            Ver los ángulos y lo que costaría
          </Boton>
        </div>
      </div>
    );
  }

  const total = totalDeVariantes(estado.creditosPorVariante, elegidos);
  const declaracionNecesaria = declaracionNecesariaEn(estado.angulos, elegidos);
  const impedimento = motivoParaNoCrearVariantes(estado.angulos, elegidos, estado.maximo, declarada);
  const nombreDe = (clave: string) => estado.angulos.find((a) => a.angulo.clave === clave)?.angulo.nombre ?? clave;

  return (
    <div className="flex flex-col gap-4">
      {estado.motivo !== "" && <Aviso tono="error">{estado.motivo}</Aviso>}

      {estado.hermanos.length > 0 && (
        <div className="flex flex-col gap-2 rounded-control bg-elevada p-4">
          <h4 className="font-bold text-texto">Los anuncios de este grupo</h4>
          <ul className="flex flex-col gap-1">
            {estado.hermanos.map((hermano) => (
              <li key={hermano.id} className="text-texto-suave">
                <Link href={`/proyectos/${hermano.id}`} className="font-semibold text-acento hover:underline">
                  {hermano.titulo}
                </Link>
                {hermano.angulo !== "" && <> · {nombreDe(hermano.angulo)}</>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ElectorDeAngulos
        angulos={estado.angulos}
        elegidos={elegidos}
        deshabilitado={deshabilitado || creando}
        onCambio={setElegidos}
      />

      {elegidos.length > 0 && (
        <p className="text-sm text-texto-suave">
          Se crearán: {elegidos.map((c) => `«${tituloDeVariante(titulo, nombreDe(c))}»`).join(", ")}.
        </p>
      )}

      {declaracionNecesaria && (
        <ZonaDeDeclaracion
          nombreAngulo={estado.angulos
            .filter((a) => a.exigeDeclaracion && elegidos.includes(a.angulo.clave))
            .map((a) => a.angulo.nombre)
            .join(", ")}
          aviso={`${AVISO_DECLARACION_NECESARIA} Se declara una vez para toda la tanda y se registra en cada variante que la necesita.`}
          registrada={false}
          aceptada={declarada}
          deshabilitado={deshabilitado || creando}
          onAceptar={setDeclarada}
        />
      )}

      {/* Zona de claridad del gasto: el total agregado, una sola confirmación. */}
      <div className="flex flex-col gap-3 rounded-tarjeta border-2 border-borde bg-superficie p-4">
        <h4 className="font-bold text-texto">Lo que va a costar</h4>
        <p className="font-mono text-texto">
          {estado.porCuota ? (
            <>
              {elegidos.length} {elegidos.length === 1 ? "variante" : "variantes"}, cada una una llamada de texto que se
              paga con la cuota de tu plan en {estado.nombreProveedor}: 0 créditos.
            </>
          ) : (
            <>
              {formatearCreditos(estado.creditosPorVariante)} por variante × {elegidos.length} ={" "}
              {formatearCreditos(total)} (estimación) · {estado.nombreProveedor} · {estado.modelo}
            </>
          )}
        </p>
        <p className="text-sm text-texto-suave">
          Se crean proyectos con su guion en borrador. <strong className="text-texto">No se genera ningún vídeo</strong>{" "}
          y no se aprueba ningún plan. Máximo {estado.maximo} de una vez.
        </p>
        {impedimento !== "" && <p className="text-sm font-medium text-texto-suave">{impedimento}</p>}
        <div>
          <Boton
            variante="chispa"
            cargando={creando}
            disabled={deshabilitado || impedimento !== "" || estado.motivo !== ""}
            onClick={crear}
          >
            Crear {elegidos.length === 1 ? "la variante" : `las ${elegidos.length} variantes`}
          </Boton>
        </div>
      </div>

      {creadas !== null && (
        <ul className="flex flex-col gap-2">
          {creadas.variantes.map((variante) => (
            <li
              key={variante.proyectoId}
              className="flex flex-col gap-1 rounded-control border border-borde bg-superficie p-3"
            >
              <Link href={`/proyectos/${variante.proyectoId}`} className="font-semibold text-acento hover:underline">
                {variante.titulo}
              </Link>
              <span className="text-sm text-texto-suave">
                {variante.error !== ""
                  ? variante.error
                  : variante.propuesta === null
                    ? "Creada sin guion todavía."
                    : `Guion propuesto en ${variante.propuesta.escenasEscritas} escenas, con ${variante.propuesta.hooks.length} hooks para elegir dentro.`}
              </span>
              {variante.propuesta?.motivoGuionNoEscrito !== undefined &&
                variante.propuesta.motivoGuionNoEscrito !== "" && (
                  // alerta-permitida: estado de esta variante, junto a ella
                  <span className="text-sm text-error">{variante.propuesta.motivoGuionNoEscrito}</span>
                )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
