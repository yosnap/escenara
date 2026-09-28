import type { CambioCatalogo } from "@/lib/catalogo";

/**
 * Historial del catálogo: quién cambió qué, cuándo y con qué evidencia. Es lo que permite explicar por qué
 * una estimación anterior ya no vale sin tener que tocar ningún trabajo ya creado.
 */

const ETIQUETA_CAMPO: Record<CambioCatalogo["campo"], string> = {
  alta: "Alta en el catálogo",
  estado: "Cambio de estado",
  precio: "Cambio de precio",
  variante: "Cambio de variante",
  desviacion: "Desviación de lo cobrado",
  predeterminado: "Opción por defecto",
};

const fecha = (iso: string) =>
  new Date(iso).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Madrid" });

export function HistorialCatalogo({ cambios }: { cambios: CambioCatalogo[] }) {
  if (cambios.length === 0) return null;
  return (
    <section className="flex flex-col gap-3 rounded-tarjeta border border-borde bg-superficie p-5">
      <h2 className="text-xl font-bold text-texto">Historial del catálogo</h2>
      <ol className="flex flex-col gap-3">
        {cambios.map((c) => (
          <li key={c.id} className="rounded-control bg-elevada px-3 py-2">
            <p className="text-texto">
              <span className="font-semibold">{ETIQUETA_CAMPO[c.campo]}</span> en{" "}
              <span className="font-mono">{c.modelo}</span>
              {c.desde && c.hasta ? `: ${c.desde} → ${c.hasta}` : c.hasta ? `: ${c.hasta}` : ""}
            </p>
            <p className="text-sm text-texto-suave">
              {fecha(c.fecha)} · {c.autor ?? "semilla del catálogo"}
            </p>
            {c.evidencia && <p className="text-sm text-texto-suave">{c.evidencia}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}
