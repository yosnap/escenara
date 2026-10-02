import Link from "next/link";
import { consultarConsumo } from "@/server/admin/consumo";
import type { Parametros } from "@/server/admin/filtros";
import { exigirAdmin } from "@/server/auth/sesion";
import { FiltroAdmin } from "../filtro-admin";
import { ErrorAdmin, estiloCampoAdmin, PaginaAdmin, PaginacionAdmin } from "../ui-admin";

export const metadata = { title: "Generaciones y consumo · Administración" };
export default async function Consumo({ searchParams }: { searchParams: Promise<Parametros> }) {
  const sesion = await exigirAdmin("/admin/consumo");
  const p = await searchParams;
  let datos: Awaited<ReturnType<typeof consultarConsumo>>;
  try {
    datos = await consultarConsumo(sesion.user.id, p);
  } catch {
    return (
      <PaginaAdmin titulo="Generaciones y consumo">
        <ErrorAdmin>
          No se ha podido consultar el consumo. Comprueba los filtros y el intervalo (máximo 366 días) y vuelve a
          intentarlo.
        </ErrorAdmin>
      </PaginaAdmin>
    );
  }
  const valor = (clave: string) => (typeof p[clave] === "string" ? p[clave] : "");
  return (
    <PaginaAdmin titulo="Generaciones y consumo">
      <form action="/admin/consumo" className="flex flex-wrap items-end gap-3">
        <FiltroAdmin nombre="usuario" etiqueta="Usuario (id)" valor={valor("usuario")} />
        <FiltroAdmin
          nombre="proveedor"
          etiqueta="Proveedor"
          valor={valor("proveedor")}
          opciones={["kie", "google", "elevenlabs", "compatible", "local"]}
        />
        <FiltroAdmin
          nombre="tipo"
          etiqueta="Tipo"
          valor={valor("tipo")}
          opciones={["generacion", "asistente", "traduccion", "revision"]}
        />
        <FiltroAdmin
          nombre="estado"
          etiqueta="Estado"
          valor={valor("estado")}
          opciones={[
            "preparando",
            "en_cola",
            "enviando",
            "enviado",
            "en_curso",
            "listo",
            "fallido",
            "desconocido",
            "esperando_limite",
            "cancelado",
            "reservado",
            "cerrado",
          ]}
        />
        <label>
          Desde (UTC)
          <input
            type="date"
            name="desde"
            defaultValue={datos.inicio.toISOString().slice(0, 10)}
            className={estiloCampoAdmin}
          />
        </label>
        <label>
          Hasta (exclusivo)
          <input
            type="date"
            name="hasta"
            defaultValue={datos.fin.toISOString().slice(0, 10)}
            className={estiloCampoAdmin}
          />
        </label>
        <button type="submit" className={estiloCampoAdmin}>
          Filtrar
        </button>
      </form>
      <section className="space-y-3">
        <h2 className="text-xl font-bold">Movimientos del intervalo por proveedor</h2>
        <p>
          Créditos de distintos proveedores no son equivalentes. Estos movimientos no son el saldo BYOK ni el
          presupuesto disponible. Los euros son importes históricos registrados.
        </p>
        <TablaDesplazable etiqueta="Datos administrativos">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Gasto del periodo</caption>
            <thead>
              <tr>
                {[
                  "Proveedor / tipo",
                  "Reserva neta",
                  "Retenido",
                  "Consumo",
                  "Informado / estimado",
                  "Euros registrados",
                ].map((t) => (
                  <th key={t} scope="col" className="p-3">
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {datos.agregados.map((a) => (
                <tr key={`${a.proveedor}-${a.nombre}-${a.tipo}`} className="border-t border-borde">
                  <td className="p-3">
                    {a.nombre || a.proveedor} / {a.tipo}
                  </td>
                  <td className="p-3">{a.reservado}</td>
                  <td className="p-3">{a.retenido}</td>
                  <td className="p-3">{a.consumido}</td>
                  <td className="p-3">
                    {a.informado} / {a.estimado}
                  </td>
                  <td className="p-3">
                    {a.euros === null ? "No informado" : `${a.euros.toFixed(4)} €`}
                    {a.sin_euros > 0 && ` · ${a.sin_euros} apuntes sin importe`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TablaDesplazable>
        {!datos.agregados.length && <p>Sin movimientos del ledger en este intervalo.</p>}
      </section>
      <section>
        <h2 className="mb-3 text-xl font-bold">Trabajos y llamadas</h2>
        <TablaDesplazable etiqueta="Datos administrativos">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Generaciones sin contenido privado</caption>
            <thead>
              <tr>
                {["Fecha UTC", "Usuario", "Tipo", "Proveedor / modelo", "Estado"].map((t) => (
                  <th key={t} scope="col" className="p-3">
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {datos.filas.map((f) => (
                <tr key={`${f.tipo}-${f.id}`} className="border-t border-borde">
                  <td className="p-3">{new Date(f.fecha).toISOString()}</td>
                  <td className="p-3">
                    <Link href={`/admin/usuarios/${f.user_id}`} className="break-all text-acento">
                      {f.user_id}
                    </Link>
                  </td>
                  <td className="p-3">
                    {f.tipo} / {f.subtipo}
                  </td>
                  <td className="break-all p-3">
                    {f.proveedor} / {f.modelo}
                  </td>
                  <td className="p-3">{f.estado}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TablaDesplazable>
        {!datos.filas.length && <p>Sin llamadas con estos filtros.</p>}
      </section>
      <PaginacionAdmin ruta="/admin/consumo" filtros={p} pagina={datos.pagina} total={datos.total} />
    </PaginaAdmin>
  );
}

import { TablaDesplazable } from "@/components/ui/tabla-desplazable";
