import { Clapperboard, FileArchive, ImageIcon, ListChecks } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { claseBoton } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { TablaDesplazable } from "@/components/ui/tabla-desplazable";
import { fechaYHora } from "@/lib/fechas";
import { ETIQUETA_FORMATO_MONTAJE, type FormatoMontaje } from "@/lib/formatos";
import { type EstadoTrabajo, ETIQUETA_ESTADO, ETIQUETA_TIPO_TRABAJO, type TipoTrabajoCola } from "@/lib/generacion";

/**
 * Cronología del historial («Tus datos»): trabajos, revisiones, montajes y exportaciones, con filtros y paginación
 * **por enlaces** (sin JavaScript en el navegador). Los tipos se repiten aquí a propósito, sin importar el servidor:
 * este componente también se pinta en el catálogo de componentes.
 */

export type TipoEventoVista = "trabajo" | "revision" | "montaje" | "exportacion";

export interface EventoVista {
  tipo: TipoEventoVista;
  id: string;
  fecha: string;
  proyectoId: string | null;
  proyectoTitulo: string | null;
  estado: string;
  clase: string;
  proveedor: string | null;
  modelo: string | null;
  creditosEstimados: number | null;
  creditosConsumidos: number | null;
  fallo: string | null;
  resultadoId: string | null;
}

export interface FiltroVista {
  tipo: TipoEventoVista | null;
  mes: string | null;
  proyectoId: string | null;
  pagina: number;
}

const FILTROS_TIPO: { tipo: TipoEventoVista | null; etiqueta: string }[] = [
  { tipo: null, etiqueta: "Todo" },
  { tipo: "trabajo", etiqueta: "Generaciones" },
  { tipo: "revision", etiqueta: "Revisiones" },
  { tipo: "montaje", etiqueta: "Montajes" },
  { tipo: "exportacion", etiqueta: "Exportaciones" },
];

const ICONO: Record<TipoEventoVista, ReactNode> = {
  trabajo: <ImageIcon />,
  revision: <ListChecks />,
  montaje: <Clapperboard />,
  exportacion: <FileArchive />,
};

const ESTADOS_OTROS: Record<string, string> = {
  acepta: "Aceptada",
  rechaza: "Rechazada",
  pendiente: "Pendiente",
  en_cola: "En cola",
  en_curso: "Montándose",
  listo: "Listo",
  fallido: "Ha fallado",
  preparando: "Preparándose",
  lista: "Lista",
  fallida: "Ha fallado",
  caducada: "Caducada",
};

const REVISIONES: Record<string, string> = {
  automatica: "Revisión automática",
  humana: "Revisión tuya",
  multimodal: "Revisión con modelo",
};

function titulo(e: EventoVista): string {
  if (e.tipo === "trabajo") return ETIQUETA_TIPO_TRABAJO[e.clase as TipoTrabajoCola] ?? "Generación";
  if (e.tipo === "revision") return REVISIONES[e.clase] ?? "Revisión";
  if (e.tipo === "montaje") return `Montaje ${ETIQUETA_FORMATO_MONTAJE[e.clase as FormatoMontaje] ?? ""}`.trim();
  return "Paquete ZIP del proyecto";
}

function estado(e: EventoVista): string {
  if (e.tipo === "trabajo") return ETIQUETA_ESTADO[e.estado as EstadoTrabajo] ?? e.estado;
  return ESTADOS_OTROS[e.estado] ?? e.estado;
}

const esFallo = (e: EventoVista) => ["fallido", "fallida", "rechaza", "desconocido"].includes(e.estado);
const creditos = (n: number) => n.toLocaleString("es-ES", { maximumFractionDigits: 1 });

/** URL de la misma página con el filtro cambiado. La página vuelve a la primera al cambiar un filtro. */
export function urlConFiltro(base: string, filtro: FiltroVista, cambios: Partial<FiltroVista>): string {
  const f = { ...filtro, pagina: 1, ...cambios };
  const q = new URLSearchParams();
  if (f.tipo) q.set("tipo", f.tipo);
  if (f.mes) q.set("mes", f.mes);
  if (f.proyectoId) q.set("proyecto", f.proyectoId);
  if (f.pagina > 1) q.set("pagina", String(f.pagina));
  const texto = q.toString();
  return texto ? `${base}?${texto}` : base;
}

function Chip({ href, activo, children }: { href: string; activo: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={activo ? "page" : undefined}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors",
        activo ? "border-acento bg-acento/12 text-texto" : "border-borde text-texto-suave hover:bg-elevada",
      )}
    >
      {children}
    </Link>
  );
}

export function FiltrosHistorial({
  base,
  filtro,
  meses,
  proyectos = [],
}: {
  base: string;
  filtro: FiltroVista;
  meses: string[];
  proyectos?: { id: string; titulo: string }[];
}) {
  const nombreMes = (mes: string) =>
    new Date(`${mes}-15T12:00:00Z`).toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  return (
    <nav aria-label="Filtros del historial" className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {FILTROS_TIPO.map((f) => (
          <Chip key={f.etiqueta} href={urlConFiltro(base, filtro, { tipo: f.tipo })} activo={filtro.tipo === f.tipo}>
            {f.etiqueta}
          </Chip>
        ))}
      </div>
      {meses.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Chip href={urlConFiltro(base, filtro, { mes: null })} activo={filtro.mes === null}>
            Todos los meses
          </Chip>
          {meses.map((mes) => (
            <Chip key={mes} href={urlConFiltro(base, filtro, { mes })} activo={filtro.mes === mes}>
              {nombreMes(mes)}
            </Chip>
          ))}
        </div>
      )}
      {proyectos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Chip href={urlConFiltro(base, filtro, { proyectoId: null })} activo={filtro.proyectoId === null}>
            Todos los proyectos
          </Chip>
          {proyectos.map((p) => (
            <Chip
              key={p.id}
              href={urlConFiltro(base, filtro, { proyectoId: p.id })}
              activo={filtro.proyectoId === p.id}
            >
              {p.titulo || "Sin título"}
            </Chip>
          ))}
        </div>
      )}
    </nav>
  );
}

function EnlaceResultado({ e }: { e: EventoVista }) {
  if (e.resultadoId) {
    return (
      <a
        href={`/api/media/${e.resultadoId}/archivo`}
        target="_blank"
        rel="noopener"
        className={claseBoton("fantasma", "sm")}
      >
        Ver el resultado
      </a>
    );
  }
  if (e.proyectoId && e.tipo === "revision") {
    return (
      <Link href={`/proyectos/${e.proyectoId}/revision`} className={claseBoton("fantasma", "sm")}>
        Ir a la revisión
      </Link>
    );
  }
  if (e.proyectoId && e.tipo === "exportacion" && e.estado === "lista") {
    return (
      <a
        href={`/api/proyectos/${e.proyectoId}/exportaciones/${e.id}/descarga`}
        className={claseBoton("fantasma", "sm")}
      >
        Descargar el ZIP
      </a>
    );
  }
  return null;
}

export function Cronologia({
  eventos,
  base,
  filtro,
  hayMas,
  conProyecto = false,
}: {
  eventos: EventoVista[];
  base: string;
  filtro: FiltroVista;
  hayMas: boolean;
  /** En el historial de la cuenta se dice de qué proyecto es cada cosa. */
  conProyecto?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      {eventos.length === 0 ? (
        <p className="rounded-tarjeta border border-borde bg-superficie p-6 text-texto-suave">
          No hay nada con estos filtros.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {eventos.map((e) => (
            <li
              key={`${e.tipo}-${e.id}`}
              className="flex flex-wrap items-start justify-between gap-3 rounded-tarjeta border border-borde bg-superficie p-4"
            >
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-acento/12 text-acento [&>svg]:size-4"
                >
                  {ICONO[e.tipo]}
                </span>
                <div className="flex flex-col gap-0.5">
                  <p className="font-semibold text-texto">
                    {titulo(e)} · <span className={esFallo(e) ? "text-error" : undefined}>{estado(e)}</span>
                  </p>
                  <p className="text-sm text-texto-suave">
                    <time dateTime={e.fecha}>{fechaYHora(e.fecha)}</time>
                    {conProyecto && (
                      <>
                        {" · "}
                        {e.proyectoId ? (
                          <Link href={`/proyectos/${e.proyectoId}`} className="underline">
                            {e.proyectoTitulo || "Proyecto sin título"}
                          </Link>
                        ) : (
                          "Crear (sin proyecto)"
                        )}
                      </>
                    )}
                    {e.proveedor && ` · ${e.proveedor.toUpperCase()}`}
                  </p>
                  {(e.creditosEstimados !== null || e.creditosConsumidos !== null) && (
                    <p className="text-sm text-texto-suave">
                      {e.creditosEstimados !== null && `Estimado: ${creditos(e.creditosEstimados)} créditos`}
                      {e.creditosEstimados !== null && e.creditosConsumidos !== null && " · "}
                      {e.creditosConsumidos !== null && `Consumido: ${creditos(e.creditosConsumidos)} créditos`}
                    </p>
                  )}
                  {/* alerta-permitida: causa de un fallo ya pasado, apuntada en el historial; no es un problema abierto */}
                  {e.fallo && <p className="text-sm text-error">{e.fallo}</p>}
                </div>
              </div>
              <EnlaceResultado e={e} />
            </li>
          ))}
        </ol>
      )}
      {(filtro.pagina > 1 || hayMas) && (
        <nav aria-label="Páginas del historial" className="flex items-center justify-between gap-3">
          {filtro.pagina > 1 ? (
            <Link
              href={urlConFiltro(base, filtro, { pagina: filtro.pagina - 1 })}
              className={claseBoton("secundario", "sm")}
            >
              Más recientes
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-texto-suave">Página {filtro.pagina}</span>
          {hayMas ? (
            <Link
              href={urlConFiltro(base, filtro, { pagina: filtro.pagina + 1 })}
              className={claseBoton("secundario", "sm")}
            >
              Más antiguos
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}

export interface GastoMesVista {
  mes: string;
  proyectoId: string | null;
  proyectoTitulo: string | null;
  estimado: number;
  consumido: number;
  euros: number;
}

/** Gasto por mes (y por proyecto en la cuenta): estimado al pedir y consumido de verdad. */
export function GastoPorMes({ filas, conProyecto = false }: { filas: GastoMesVista[]; conProyecto?: boolean }) {
  if (filas.length === 0) return <p className="text-texto-suave">Todavía no hay gasto apuntado.</p>;
  const euros = (n: number) => n.toLocaleString("es-ES", { style: "currency", currency: "EUR" });
  return (
    <TablaDesplazable etiqueta={`Gasto por mes${conProyecto ? " y por proyecto" : ""}`}>
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Gasto por mes{conProyecto ? " y por proyecto" : ""}</caption>
        <thead className="text-texto-suave">
          <tr>
            <th scope="col" className="py-2 pr-4 font-semibold">
              Mes
            </th>
            {conProyecto && (
              <th scope="col" className="py-2 pr-4 font-semibold">
                Proyecto
              </th>
            )}
            <th scope="col" className="py-2 pr-4 text-right font-semibold">
              Estimado
            </th>
            <th scope="col" className="py-2 pr-4 text-right font-semibold">
              Consumido
            </th>
            <th scope="col" className="py-2 text-right font-semibold">
              Euros (orientativo)
            </th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={`${f.mes}-${f.proyectoId ?? "crear"}`} className="border-t border-borde">
              <td className="py-2 pr-4 text-texto">{f.mes}</td>
              {conProyecto && (
                <td className="py-2 pr-4 text-texto">
                  {f.proyectoId ? f.proyectoTitulo || "Sin título" : "Crear (sin proyecto)"}
                </td>
              )}
              <td className="py-2 pr-4 text-right tabular-nums">{creditos(f.estimado)}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{creditos(f.consumido)}</td>
              <td className="py-2 text-right tabular-nums">{euros(f.euros)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TablaDesplazable>
  );
}
