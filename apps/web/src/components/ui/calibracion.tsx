import { Alerta } from "@/components/ui/alerta";
import { TablaDesplazable } from "@/components/ui/tabla-desplazable";
import {
  AVISO_SIN_DATOS,
  type CalibracionVista,
  type MedidaDeUmbral,
  NOMBRE_PARTICION,
  PARTICIONES,
} from "@/lib/calibracion";
import { fechaYHora } from "@/lib/fechas";

/**
 * Una pregunta en Admin › Calibración: el conjunto etiquetado de ahora, el último umbral propuesto con la muestra que se
 * usó, y sus métricas en la partición **retenida**. Zona de claridad: cifras, sin adornos.
 *
 * Con muestra insuficiente no hay umbral que enseñar y se dice con el aviso del PRD §9. Con umbral, se recuerda que es
 * una propuesta: ningún control se vuelve bloqueante por calibrarse.
 */

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)} %`);

function Medida({ titulo, medida }: { titulo: string; medida: MedidaDeUmbral }) {
  return (
    <div className="flex flex-col gap-1 rounded-control bg-elevada p-3">
      <p className="text-sm font-semibold text-texto">{titulo}</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-texto-suave">Precisión</dt>
        <dd className="font-mono text-texto">{pct(medida.precision)}</dd>
        <dt className="text-texto-suave">Falsos permisos</dt>
        <dd className="font-mono text-texto">{medida.falsosPermisos}</dd>
        <dt className="text-texto-suave">Bloqueos innecesarios</dt>
        <dd className="font-mono text-texto">{medida.bloqueosInnecesarios}</dd>
        <dt className="text-texto-suave">Opina en</dt>
        <dd className="font-mono text-texto">
          {medida.firmes} de {medida.muestra} ({pct(medida.cobertura)})
        </dd>
      </dl>
    </div>
  );
}

export function TarjetaCalibracion({ calibracion }: { calibracion: CalibracionVista }) {
  const { ultima, conjunto } = calibracion;
  return (
    <article className="flex flex-col gap-4 rounded-tarjeta border-2 border-borde bg-superficie p-5">
      <header>
        <h3 className="text-lg font-bold text-texto">{calibracion.nombre}</h3>
        {!calibracion.etiquetaIndependiente && (
          <p className="text-sm text-texto-suave">
            Etiqueta no independiente: la persona ve el veredicto antes de corregirlo. Sirve de referencia, no de medida
            ciega.
          </p>
        )}
      </header>

      <TablaDesplazable etiqueta={`Conjunto etiquetado de «${calibracion.nombre}»`}>
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">Conjunto etiquetado por partición y etiqueta</caption>
          <thead className="text-texto-suave">
            <tr>
              <th className="py-1 font-semibold">Partición</th>
              <th className="py-1 font-semibold">Aceptadas</th>
              <th className="py-1 font-semibold">Rechazadas</th>
            </tr>
          </thead>
          <tbody>
            {PARTICIONES.map((p) => (
              <tr key={p} className="border-t border-borde/60">
                <td className="py-1 text-texto">{NOMBRE_PARTICION[p]}</td>
                <td className="py-1 font-mono text-texto">{conjunto[p].acepta}</td>
                <td className="py-1 font-mono text-texto">{conjunto[p].rechaza}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TablaDesplazable>

      {ultima === null ? (
        <p className="text-sm text-texto-suave">Todavía no se ha calibrado esta pregunta.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-texto-suave">
            Calculado el {fechaYHora(ultima.fecha)} con {ultima.muestraCalibracion} ejemplos de calibración y{" "}
            {ultima.muestraRetenida} retenidos.
          </p>
          {ultima.umbral === null ? (
            <Alerta
              tipo="aviso"
              anuncio="ninguno"
              compacta
              titulo={ultima.suficiente ? "Sin umbral que proponer" : "Muestra insuficiente"}
            >
              {ultima.motivo}
              {ultima.suficiente ? ` ${AVISO_SIN_DATOS}` : ""}
            </Alerta>
          ) : (
            <>
              <p className="font-mono text-2xl font-bold text-texto">
                Umbral propuesto: {ultima.umbral.toLocaleString("es-ES")}
              </p>
              <p className="text-sm text-texto-suave">{ultima.motivo}</p>
              <div className="grid gap-3 md:grid-cols-2">
                {ultima.enRetenido && <Medida titulo="En la partición retenida" medida={ultima.enRetenido} />}
                {ultima.enCalibracion && (
                  <Medida titulo="En la de calibración (elegido aquí)" medida={ultima.enCalibracion} />
                )}
              </div>
            </>
          )}
        </div>
      )}
    </article>
  );
}
