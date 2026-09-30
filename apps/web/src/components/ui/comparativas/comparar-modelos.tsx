import { Check, Plus, X } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { DESCRIPCION_ESTADO_MODELO, ETIQUETA_CAPACIDAD, ETIQUETA_ESTADO_MODELO } from "@/lib/catalogo";
import { AVISO_SIN_GENERAR, MAXIMO_EN_TABLA, type ModeloComparable } from "@/lib/comparativas";
import { formatearCreditos } from "@/lib/generacion";
import { Alerta } from "../alerta";
import { claseBoton } from "../button";
import { cn } from "../cn";
import { DemoDePlantilla } from "../demo-plantilla";
import { MiniaturaMedio } from "../media/miniatura-medio";
import { TablaDesplazable } from "../tabla-desplazable";

/**
 * **Comparar sin generar**: tarjetas de modelo y tabla lado a lado. Todo es lectura: los enlaces cambian la URL y nada
 * más, así que esta vista no lleva JavaScript propio ni puede gastar nada. Zona de claridad: precios con su fecha y
 * su fuente, sin adornos.
 */

const euros = (n: number | null) =>
  n === null ? "" : ` · ≈ ${n.toLocaleString("es-ES", { maximumFractionDigits: 2, minimumFractionDigits: 2 })} €`;

/** Aviso permanente de que aquí no se genera nada. No se puede cerrar. */
export function AvisoSinGenerar() {
  return (
    <Alerta tipo="info" anuncio="ninguno" titulo="Aquí no se genera nada">
      {AVISO_SIN_GENERAR} Solo gasta la comparativa generando de una escena, y antes te dice cuántas ejecuciones hará y
      cuánto costarán.
    </Alerta>
  );
}

function Precio({ modelo }: { modelo: ModeloComparable }) {
  if (modelo.creditos === null) return <span className="text-texto-suave">Sin precio registrado</span>;
  return (
    <span className="flex flex-col">
      <span className="font-mono font-semibold text-texto">
        {formatearCreditos(modelo.creditos)} / {modelo.unidad}
        {euros(modelo.euros)}
      </span>
      <span className="text-xs text-texto-suave">
        {modelo.publicado ? "Publicado por el proveedor" : "Medido en esta instalación"}, comprobado el{" "}
        {modelo.comprobado}
        {modelo.caducado ? " (antiguo: puede haber cambiado)" : ""}.
      </span>
    </span>
  );
}

function Historial({ modelo }: { modelo: ModeloComparable }) {
  const { terminados, fallidos, creditosMedios } = modelo.historial;
  if (terminados + fallidos === 0) return <span className="text-texto-suave">Todavía no lo has usado.</span>;
  return (
    <span className="text-texto">
      {terminados} terminados · {fallidos} fallidos
      {creditosMedios === null ? "" : ` · ${formatearCreditos(creditosMedios)} de media informada`}
    </span>
  );
}

/** Enlace que añade o quita el modelo de la tabla. Cambia la URL: no genera ni gasta nada. */
function EnlaceSeleccion({
  modelo,
  seleccion,
  hrefCon,
}: {
  modelo: ModeloComparable;
  seleccion: readonly string[];
  hrefCon: (ids: readonly string[]) => string;
}) {
  const dentro = seleccion.includes(modelo.id);
  if (dentro) {
    return (
      <Link
        href={hrefCon(seleccion.filter((id) => id !== modelo.id))}
        className={claseBoton("secundario", "sm")}
        aria-label={`Quitar ${modelo.nombre} de la tabla`}
      >
        <X className="size-4" aria-hidden /> Quitar de la tabla
      </Link>
    );
  }
  if (seleccion.length >= MAXIMO_EN_TABLA) {
    return <span className="text-sm text-texto-suave">La tabla ya tiene {MAXIMO_EN_TABLA} modelos.</span>;
  }
  return (
    <Link
      href={hrefCon([...seleccion, modelo.id])}
      className={claseBoton("secundario", "sm")}
      aria-label={`Añadir ${modelo.nombre} a la tabla`}
    >
      <Plus className="size-4" aria-hidden /> Añadir a la tabla
    </Link>
  );
}

export function TarjetaModeloComparable({
  modelo,
  seleccion,
  hrefCon,
}: {
  modelo: ModeloComparable;
  seleccion: readonly string[];
  hrefCon: (ids: readonly string[]) => string;
}) {
  const dentro = seleccion.includes(modelo.id);
  return (
    <article
      className={cn(
        "flex flex-col gap-3 rounded-tarjeta border-2 bg-superficie p-4",
        dentro ? "border-acento" : "border-borde",
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-bold text-texto">
            {dentro && <Check className="mr-1 inline size-4 text-acento" aria-label="En la tabla" />}
            {modelo.nombre}
          </h3>
          <p className="text-sm text-texto-suave">{modelo.nombreProveedor}</p>
        </div>
        {/* Sin la insignia con icono del catálogo de modelos: su módulo arrastra el selector al navegador. */}
        <span
          title={DESCRIPCION_ESTADO_MODELO[modelo.estado]}
          className="rounded-full bg-elevada px-3 py-1 text-sm font-semibold text-texto"
        >
          {ETIQUETA_ESTADO_MODELO[modelo.estado]}
        </span>
      </header>
      <Precio modelo={modelo} />
      <p className="text-sm">
        <Historial modelo={modelo} />
      </p>
      {modelo.ejemplos.length > 0 && (
        <p className="text-sm text-texto-suave">
          {modelo.ejemplos.length === 1 ? "1 ejemplo" : `${modelo.ejemplos.length} ejemplos`} de la instalación
        </p>
      )}
      {modelo.notas && <p className="text-sm text-texto-suave">{modelo.notas}</p>}
      <EnlaceSeleccion modelo={modelo} seleccion={seleccion} hrefCon={hrefCon} />
    </article>
  );
}

/** Los modelos elegidos, lado a lado. */
export function TablaComparativa({ modelos }: { modelos: readonly ModeloComparable[] }) {
  if (modelos.length === 0) return null;
  const filas: { titulo: string; celda: (m: ModeloComparable) => ReactNode }[] = [
    { titulo: "Precio", celda: (m) => <Precio modelo={m} /> },
    {
      titulo: "Duraciones",
      celda: (m) =>
        m.duraciones.length === 0
          ? "—"
          : m.duraciones.map((d) => `${d.segundos} s: ${formatearCreditos(d.creditos)}`).join(" · "),
    },
    {
      titulo: "Voz",
      celda: (m) => (m.capacidades.some((c) => c.endsWith("video")) ? (m.conVoz ? "Con voz" : "Sin voz") : "—"),
    },
    { titulo: "Qué hace", celda: (m) => m.capacidades.map((c) => ETIQUETA_CAPACIDAD[c]).join(" · ") },
    { titulo: "Tus resultados", celda: (m) => <Historial modelo={m} /> },
    {
      titulo: "Tus últimos",
      celda: (m) =>
        m.historial.recientes.length === 0 ? (
          "—"
        ) : (
          <ul className="flex flex-wrap gap-2">
            {m.historial.recientes.map((medio) => (
              <li key={medio.id} className="size-24 overflow-hidden rounded-control bg-elevada">
                <MiniaturaMedio medio={medio} className="size-full object-contain" controles={medio.tipo === "video"} />
              </li>
            ))}
          </ul>
        ),
    },
    {
      titulo: "Ejemplos de la instalación",
      celda: (m) =>
        m.ejemplos.length === 0 ? (
          "—"
        ) : (
          <div className="flex flex-col gap-2">
            {m.ejemplos.slice(0, 2).map((e) => (
              <DemoDePlantilla key={e.demo.url} demo={e.demo} titulo={e.plantilla} alturaMaxima="12rem" />
            ))}
          </div>
        ),
    },
    { titulo: "Notas", celda: (m) => m.notas || "—" },
  ];
  return (
    <TablaDesplazable etiqueta="Modelos elegidos, lado a lado" className="rounded-tarjeta border-2 border-borde">
      <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
        <caption className="sr-only">Modelos elegidos, lado a lado</caption>
        <thead className="bg-elevada">
          <tr>
            <th scope="col" className="p-3 font-semibold text-texto-suave">
              <span className="sr-only">Dato</span>
            </th>
            {modelos.map((m) => (
              <th key={m.id} scope="col" className="p-3 font-bold text-texto">
                {m.nombre}
                <span className="block text-xs font-normal text-texto-suave">{m.nombreProveedor}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.titulo} className="border-t border-borde/60 align-top">
              <th scope="row" className="p-3 font-semibold text-texto-suave">
                {f.titulo}
              </th>
              {modelos.map((m) => (
                <td key={m.id} className="p-3 text-texto">
                  {f.celda(m)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </TablaDesplazable>
  );
}
