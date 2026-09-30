"use client";

import { Hand } from "lucide-react";
import { useState } from "react";
import {
  AYUDA_ACCION_UNICA,
  FAMILIAS_PLEGADAS,
  masAccionesAbierto,
  masAccionesSePuedeCerrar,
  resumenAccionElegida,
  TITULO_MAS_ACCIONES,
} from "@/lib/acciones-producto-pantalla";
import type { OpcionDireccion } from "@/lib/direccion";
import {
  esAccionPocoFiable,
  type FamiliaAccionProducto,
  familiaDeAccion,
  NOMBRE_FAMILIA_ACCION,
} from "@/lib/productos";
import { ElectorVisual, type OpcionVisual, type SeccionVisual } from "../direccion/elector-visual";
import { fraseDeAccionProducto, PictogramaProducto, PictogramaSinProducto } from "./pictogramas-producto";

/**
 * **Qué se hace con el producto** (0.33.2): UNA sola elección entre todas las acciones, aunque salgan repartidas
 * en familias. Es un único grupo de radios: elegir una acción de moda desmarca la de «Con el producto en la
 * mano», que es lo que significa que solo haya una.
 *
 * Las definiciones de los pictogramas (`DefinicionesPictogramaProducto`) las monta quien lo usa, una vez por página.
 *
 * - arriba, una frase que lo dice y un resumen «Elegida: …» que cambia al elegir en cualquier familia;
 * - las familias visibles son partes de la misma lista, con su subtítulo;
 * - moda y cuidado de la piel van en «Más acciones», cerrado por defecto y abierto solo si la acción elegida
 *   es de ellas: el producto no dice si es ropa o cosmética y no se adivina por el nombre.
 */
export function ElectorAccionProducto({
  acciones,
  accion,
  deshabilitado,
  onCambio,
}: {
  /** Catálogo de acciones, tal como llega con el resto de la dirección. */
  acciones: OpcionDireccion[];
  /** La acción elegida; cadena vacía = ninguna. */
  accion: string;
  deshabilitado?: boolean;
  onCambio: (accion: string) => void;
}) {
  // Lo que ha decidido la persona con el botón. El bloque está abierto si ella lo abrió o si la acción elegida vive
  // dentro (se deriva: una acción de moda que llega por otra vía lo abre sin depender de este estado).
  const [abiertoPorLaPersona, setAbiertoPorLaPersona] = useState(false);
  const abierto = masAccionesAbierto(abiertoPorLaPersona, accion);
  /**
   * Las acciones se enseñan **por familias** (general, moda, cuidado de la piel): son catorce y en una sola
   * rejilla no se encuentra ninguna. La familia sale del prefijo de la clave, así que una acción nueva de
   * quien administra aparece en su sitio sin tocar esto.
   */
  const tarjeta = (a: OpcionDireccion): OpcionVisual => ({
    valor: a.clave,
    nombre: a.nombre,
    frase: fraseDeAccionProducto(a.clave),
    descripcion: a.descripcion,
    pictograma: <PictogramaProducto clave={a.clave} />,
    // Se dice en la propia tarjeta, antes de elegirla: es lo que decide si merece la pena gastar en ella.
    ...(esAccionPocoFiable(a.clave) ? { etiqueta: "Poco fiable" } : {}),
  });
  const porFamilia = (familia: FamiliaAccionProducto): OpcionVisual[] =>
    acciones.filter((a) => familiaDeAccion(a.clave) === familia).map(tarjeta);
  const generales: OpcionVisual[] = [
    {
      valor: "",
      nombre: "Sin elegir",
      frase: "Lo decide el modelo: puede salir en la mano, en la mesa o fuera de plano.",
      pictograma: <PictogramaSinProducto />,
    },
    ...porFamilia("general"),
  ];
  // Moda y cuidado de la piel son partes de la misma lista, no otros campos. El producto no dice si es ropa o
  // cosmética, así que van plegadas en lugar de salir siempre; sin acciones de una familia no se pinta su parte.
  const seccionesPlegadas: SeccionVisual[] = FAMILIAS_PLEGADAS.map((familia) => ({
    clave: familia,
    titulo: NOMBRE_FAMILIA_ACCION[familia],
    opciones: porFamilia(familia),
  })).filter((seccion) => seccion.opciones.length > 0);

  return (
    <ElectorVisual
      etiqueta="Qué se hace con él"
      icono={Hand}
      tono="producto"
      ayuda={AYUDA_ACCION_UNICA}
      resumen={resumenAccionElegida(accion, acciones)}
      valor={accion}
      deshabilitado={deshabilitado}
      tituloOpciones={NOMBRE_FAMILIA_ACCION.general}
      opciones={generales}
      plegable={
        seccionesPlegadas.length > 0
          ? {
              titulo: TITULO_MAS_ACCIONES,
              abierto,
              bloqueado: abierto && !masAccionesSePuedeCerrar(accion),
              onCambioAbierto: setAbiertoPorLaPersona,
              secciones: seccionesPlegadas,
            }
          : undefined
      }
      onCambio={(nueva) => {
        // Si el bloque estaba abierto porque la acción vivía dentro, se queda abierto al elegir otra: que no se
        // pliegue bajo el cursor.
        if (abierto) setAbiertoPorLaPersona(true);
        onCambio(nueva);
      }}
    />
  );
}
