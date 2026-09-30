import type { Metadata } from "next";
import Link from "next/link";
import {
  AvisoSinGenerar,
  TablaComparativa,
  TarjetaModeloComparable,
} from "@/components/ui/comparativas/comparar-modelos";
import { type Capacidad, ETIQUETA_CAPACIDAD } from "@/lib/catalogo";
import { CAPACIDADES_COMPARABLES, MAXIMO_EN_TABLA } from "@/lib/comparativas";
import { exigirSesion } from "@/server/auth/sesion";
import { compararSinGenerar } from "@/server/comparativas/sin-generar";
import { CabeceraApp } from "../_app/cabecera-app";

export const metadata: Metadata = { title: "Comparar modelos" };
export const dynamic = "force-dynamic";

const esComparable = (v: unknown): v is Capacidad => CAPACIDADES_COMPARABLES.includes(v as Capacidad);

/**
 * **Comparar modelos sin generar**: precios del catálogo, tus resultados de antes y ejemplos de la instalación, lado a
 * lado. Coste cero por diseño: esta página solo lee (lo garantiza un test que recorre sus importaciones) y no lleva
 * JavaScript propio: elegir qué modelos van a la tabla es cambiar la URL.
 */
export default async function PaginaComparar({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sesion = await exigirSesion("/comparar");
  const parametros = await searchParams;
  const capacidad = esComparable(parametros.capacidad) ? parametros.capacidad : "image_to_video";
  const pedidos = [parametros.m ?? []].flat().filter((v): v is string => typeof v === "string");
  const { modelos } = await compararSinGenerar({ id: sesion.user.id, esAdmin: false }, capacidad);
  // Solo cuentan los que existen en esta capacidad, sin repetir y como mucho los que caben en la tabla.
  const seleccion = [...new Set(pedidos)].filter((id) => modelos.some((m) => m.id === id)).slice(0, MAXIMO_EN_TABLA);
  const hrefCon = (ids: readonly string[]) => {
    const q = new URLSearchParams({ capacidad });
    for (const id of ids) q.append("m", id);
    return `/comparar?${q.toString()}`;
  };
  const elegidos = seleccion.flatMap((id) => modelos.filter((m) => m.id === id));

  return (
    <div className="min-h-dvh bg-fondo">
      <CabeceraApp sesion={sesion} />
      <main id="contenido" tabIndex={-1} className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-8 md:px-8">
        <div>
          <h1 className="text-4xl font-bold text-texto">Comparar modelos</h1>
          <p className="mt-2 max-w-3xl text-texto-suave">
            Precio, lo que ya has hecho con cada modelo y ejemplos de la instalación, lado a lado. Elige hasta{" "}
            {MAXIMO_EN_TABLA} modelos para verlos juntos.
          </p>
        </div>
        <AvisoSinGenerar />

        <nav aria-label="Qué comparar">
          <ul className="flex max-w-full flex-wrap gap-1 rounded-full bg-elevada p-1">
            {CAPACIDADES_COMPARABLES.map((c) => (
              <li key={c}>
                <Link
                  href={`/comparar?capacidad=${c}`}
                  aria-current={c === capacidad ? "page" : undefined}
                  className={
                    c === capacidad
                      ? "block rounded-full bg-superficie px-4 py-2 text-sm font-semibold text-texto"
                      : "block rounded-full px-4 py-2 text-sm font-medium text-texto-suave hover:text-texto"
                  }
                >
                  {ETIQUETA_CAPACIDAD[c]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {elegidos.length > 0 && (
          <section aria-labelledby="tabla" className="flex flex-col gap-3">
            <h2 id="tabla" className="text-2xl font-bold text-texto">
              Lado a lado
            </h2>
            <TablaComparativa modelos={elegidos} />
          </section>
        )}

        <section aria-labelledby="modelos" className="flex flex-col gap-3">
          <h2 id="modelos" className="text-2xl font-bold text-texto">
            {ETIQUETA_CAPACIDAD[capacidad]}
          </h2>
          {modelos.length === 0 ? (
            <p className="text-texto-suave">Esta instalación no tiene modelos con esta capacidad.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {modelos.map((m) => (
                <TarjetaModeloComparable key={m.id} modelo={m} seleccion={seleccion} hrefCon={hrefCon} />
              ))}
            </div>
          )}
        </section>

        <section aria-labelledby="generando" className="flex flex-col gap-2 rounded-tarjeta bg-elevada p-5">
          <h2 id="generando" className="text-xl font-bold text-texto">
            ¿Y si quiero verlo con mi escena?
          </h2>
          <p className="max-w-3xl text-texto-suave">
            Desde la producción de un proyecto, en una escena con su fotograma aprobado, «Comparar generando» anima ese
            fotograma con dos modelos. Eso sí gasta: antes de confirmar te dice cuántas ejecuciones hará y cuánto
            costarán, y pasa por la cola con tu presupuesto como cualquier clip.
          </p>
          <Link href="/proyectos" className="self-start font-semibold text-acento underline">
            Ir a tus proyectos
          </Link>
        </section>
      </main>
    </div>
  );
}
