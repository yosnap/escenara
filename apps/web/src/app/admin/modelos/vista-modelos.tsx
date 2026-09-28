"use client";

import { useState } from "react";
import { Aviso, EstadoVacio } from "@/components/ui/feedback";
import { FichaModelo } from "@/components/ui/modelo";
import { Selector } from "@/components/ui/select";
import {
  CAPACIDADES,
  type CambioCatalogo,
  ESTADOS_MODELO,
  ETIQUETA_CAPACIDAD,
  ETIQUETA_ESTADO_MODELO,
  type ModeloVista,
} from "@/lib/catalogo";
import type { ResultadoModelo } from "./acciones";
import { BotonesPredeterminado, DialogoEstado, DialogoPrecio, DialogoVariante } from "./dialogos-modelo";
import { HistorialCatalogo } from "./historial-catalogo";
import { SincronizarPrecios, type UltimaLectura } from "./sincronizar-precios";

/**
 * Catálogo filtrable por capacidad, proveedor y estado, con la edición de precio y de estado de cada
 * modelo. El filtro se hace en el navegador sobre el catálogo completo: son decenas de filas, no miles.
 */

const TODOS = "todos";

export function VistaModelos({
  inicial,
  historialInicial,
  conAdaptador,
  conPreciosPublicos,
  ultimasLecturas,
}: {
  inicial: ModeloVista[];
  historialInicial: CambioCatalogo[];
  /** Proveedores a los que esta instalación ya sabe hablar. */
  conAdaptador: string[];
  /** Proveedores cuya tarifa pública sabe leer esta instalación (0.23.0). */
  conPreciosPublicos: string[];
  ultimasLecturas: UltimaLectura[];
}) {
  const [modelos, setModelos] = useState(inicial);
  const [historial, setHistorial] = useState(historialInicial);
  const [capacidad, setCapacidad] = useState<string>(TODOS);
  const [proveedor, setProveedor] = useState<string>(TODOS);
  const [estado, setEstado] = useState<string>(TODOS);
  const [aviso, setAviso] = useState<string | null>(null);

  const proveedores = [...new Set(modelos.map((m) => m.proveedor))];
  const nombreProveedor = (slug: string) => modelos.find((m) => m.proveedor === slug)?.nombreProveedor ?? slug;

  const visibles = modelos.filter(
    (m) =>
      (capacidad === TODOS || m.capacidades.some((c) => c === capacidad)) &&
      (proveedor === TODOS || m.proveedor === proveedor) &&
      (estado === TODOS || m.estado === estado),
  );

  const alCambiar = (resultado: ResultadoModelo) => {
    if (!resultado.ok) return;
    setModelos(resultado.modelos);
    setHistorial(resultado.historial);
    setAviso(
      resultado.estimacionesAfectadas > 0
        ? `Guardado. Hay ${resultado.estimacionesAfectadas} trabajo(s) de este modelo en marcha: sus estimaciones quedan caducadas y habrá que volver a confirmarlas. Los créditos ya consumidos no cambian.`
        : "Guardado.",
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <SincronizarPrecios
        proveedores={conPreciosPublicos}
        ultimas={ultimasLecturas}
        onCatalogo={(nuevos, nuevoHistorial, texto) => {
          setModelos(nuevos);
          setHistorial(nuevoHistorial);
          setAviso(texto);
        }}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Selector
          etiqueta="Capacidad"
          valor={capacidad}
          onCambio={(v) => setCapacidad(v ?? TODOS)}
          opciones={[
            { value: TODOS, label: "Todas las capacidades" },
            ...CAPACIDADES.map((c) => ({ value: c, label: ETIQUETA_CAPACIDAD[c] })),
          ]}
        />
        <Selector
          etiqueta="Proveedor"
          valor={proveedor}
          onCambio={(v) => setProveedor(v ?? TODOS)}
          opciones={[
            { value: TODOS, label: "Todos los proveedores" },
            ...proveedores.map((p) => ({
              value: p,
              label: nombreProveedor(p),
              descripcion: conAdaptador.includes(p) ? undefined : "Sin adaptador todavía: no se le puede enviar nada.",
            })),
          ]}
        />
        <Selector
          etiqueta="Estado"
          valor={estado}
          onCambio={(v) => setEstado(v ?? TODOS)}
          opciones={[
            { value: TODOS, label: "Todos los estados" },
            ...ESTADOS_MODELO.map((e) => ({ value: e, label: ETIQUETA_ESTADO_MODELO[e] })),
          ]}
        />
      </div>

      {aviso && <Aviso tono="correcto">{aviso}</Aviso>}

      <p className="text-sm text-texto-suave">
        {visibles.length} de {modelos.length} modelos.
      </p>

      {visibles.length === 0 ? (
        <EstadoVacio
          titulo="Ningún modelo con esos filtros"
          texto="Cambia la capacidad, el proveedor o el estado para ver el resto del catálogo."
        />
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {visibles.map((modelo) => (
            <li key={modelo.id}>
              <FichaModelo
                modelo={modelo}
                acciones={
                  <>
                    <DialogoPrecio modelo={modelo} onResultado={alCambiar} />
                    <DialogoVariante modelo={modelo} onResultado={alCambiar} />
                    <DialogoEstado modelo={modelo} onResultado={alCambiar} />
                    <BotonesPredeterminado modelo={modelo} onResultado={alCambiar} />
                  </>
                }
              />
            </li>
          ))}
        </ul>
      )}

      <HistorialCatalogo cambios={historial} />
    </div>
  );
}
