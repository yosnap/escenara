import type { Metadata } from "next";
import { Aviso } from "@/components/ui/feedback";
import { MUESTRA_MINIMA, nombreDeModoPara } from "@/lib/coherencia";
import { NOMBRE_REFERENCIA_IDENTIDAD } from "@/lib/direccion";
import { aciertoPorComprobacion } from "@/server/coherencia/registro";
import { compararReferenciasDeIdentidad } from "@/server/direccion/metrica-identidad";

export const metadata: Metadata = { title: "Coherencia · Admin" };
export const dynamic = "force-dynamic";

/** Días que se miran. Noventa: suficiente para juntar muestra sin arrastrar una redacción de preguntas vieja. */
const DIAS = 90;

/**
 * Acierto de cada comprobación de coherencia (RF13, 0.24.0).
 *
 * Lo que este panel **no** hace, a propósito: no propone encender nada. Con poca muestra, un porcentaje de acierto
 * es una cifra cómoda y falsa, así que por debajo de {@link MUESTRA_MINIMA} correcciones se enseña el recuento y no
 * el porcentaje, y se dice por qué. El PRD (§9) ya avisa de que el prototipo solo valida viabilidad.
 *
 * Aquí se ven **números agregados**, nunca el contenido de nadie: qué escena o qué cara se comprobó es del dueño
 * del proyecto y se ve en su pantalla de revisión, no en el panel de administración.
 */
export default async function PaginaCoherencia() {
  const filas = await aciertoPorComprobacion(DIAS);
  const identidad = await compararReferenciasDeIdentidad();
  const total = filas.reduce((suma, f) => suma + f.total, 0);
  const euros = filas.reduce((suma, f) => suma + f.euros, 0);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-5 py-10 md:px-8">
      <div>
        <h1 className="text-4xl font-bold text-texto">Coherencia</h1>
        <p className="mt-2 max-w-3xl text-texto-suave">
          Qué tal acierta cada comprobación en los últimos {DIAS} días, medido <strong>solo</strong> con lo que las
          personas han corregido: las decisiones que nadie ha mirado no tienen con qué compararse. Los modos y los
          umbrales se cambian en Ajustes › Coherencia.
        </p>
      </div>

      <Aviso tono="info">
        La confianza que devuelve Jev dice cómo de concentrada está su respuesta, <strong>no</strong> cuántas veces
        acierta. Lo que dice si acierta es esta tabla, y solo cuando tiene muestra suficiente.
      </Aviso>

      {total === 0 ? (
        <p className="text-texto-suave">
          Todavía no se ha comprobado nada. En cuanto alguien compruebe una vista generada o una escena, aparecerá aquí.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-tarjeta border-2 border-borde">
          <table className="w-full min-w-[46rem] border-collapse text-left">
            <thead className="bg-elevada text-sm text-texto-suave">
              <tr>
                <th className="p-3 font-semibold">Comprobación</th>
                <th className="p-3 font-semibold">Modo</th>
                <th className="p-3 font-semibold">Decisiones</th>
                <th className="p-3 font-semibold">Corregidas</th>
                <th className="p-3 font-semibold">Acierto</th>
                <th className="p-3 font-semibold">Falsos pases</th>
                <th className="p-3 font-semibold">Frenos de más</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((fila) => (
                <tr key={fila.comprobacion} className="border-t border-borde/60">
                  <td className="p-3 font-semibold text-texto">{fila.nombre}</td>
                  <td className="p-3 text-texto-suave">{nombreDeModoPara(fila.comprobacion, fila.modo)}</td>
                  <td className="p-3 text-texto-suave">{fila.total}</td>
                  <td className="p-3 text-texto-suave">{fila.corregidas}</td>
                  <td className="p-3 text-texto-suave">
                    {fila.corregidas < MUESTRA_MINIMA ? (
                      <span>
                        {fila.aciertos} de {fila.corregidas}
                        <span className="block text-xs">
                          Muestra corta: hacen falta {MUESTRA_MINIMA} correcciones para un porcentaje que signifique
                          algo.
                        </span>
                      </span>
                    ) : (
                      `${Math.round((fila.aciertos / fila.corregidas) * 100)} %`
                    )}
                  </td>
                  <td className="p-3 text-texto-suave">{fila.falsosPases}</td>
                  <td className="p-3 text-texto-suave">{fila.frenosInnecesarios}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/*
        Hoja 3×3 frente a vistas sueltas (0.25.0). La hoja nace candidata y **no** asciende sola: esto propone,
        decide el propietario. Sin muestra en los dos lados no se saca ninguna conclusión.
      */}
      <section className="flex flex-col gap-3">
        <h2 className="text-2xl font-bold text-texto">Hoja de identidad 3×3 frente a vistas sueltas</h2>
        <p className="max-w-3xl text-texto-suave">
          De las generaciones que Jev ha comprobado, qué porcentaje pasó el parecido según con qué referencia se
          hicieron. Hace falta una muestra de {identidad.muestraMinima} en <strong>cada</strong> grupo para que la
          comparación signifique algo.
        </p>
        <div className="overflow-x-auto rounded-tarjeta border border-borde">
          <table className="w-full text-left">
            <thead className="bg-elevada text-texto-suave text-sm">
              <tr>
                <th className="p-3 font-semibold">Referencia</th>
                <th className="p-3 font-semibold">Comprobadas</th>
                <th className="p-3 font-semibold">Pasan</th>
                <th className="p-3 font-semibold">Porcentaje</th>
              </tr>
            </thead>
            <tbody>
              {[identidad.vistas, identidad.hoja].map((grupo) => (
                <tr key={grupo.referencia} className="border-borde border-t">
                  <td className="p-3 text-texto">{NOMBRE_REFERENCIA_IDENTIDAD[grupo.referencia]}</td>
                  <td className="p-3 text-texto-suave">{grupo.total}</td>
                  <td className="p-3 text-texto-suave">{grupo.pasan}</td>
                  <td className="p-3 text-texto">
                    {grupo.porcentaje === null ? (
                      <span className="text-sm text-texto-suave">
                        Muestra corta: faltan {Math.max(0, identidad.muestraMinima - grupo.total)}.
                      </span>
                    ) : (
                      `${grupo.porcentaje} %`
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Aviso tono="info">
          {!identidad.concluyente
            ? "Todavía no hay muestra suficiente en los dos grupos, así que esta comparación no dice nada. La hoja sigue siendo candidata y no se usa por defecto."
            : identidad.ganaLaHoja
              ? "Con esta muestra, la hoja da mejor parecido que las vistas sueltas. Sigue siendo candidata: el cambio a referencia por defecto lo aprueba el propietario, no este panel."
              : "Con esta muestra, la hoja no supera a las vistas sueltas. Se queda como candidata."}
        </Aviso>
      </section>

      <p className="text-sm text-texto-suave">
        Coste de Jev en estos {DIAS} días: {euros.toLocaleString("es-ES", { maximumFractionDigits: 4 })} €. Lo paga esta
        instalación con su propia clave, así que <strong>no</strong> entra en el registro de gasto de ningún usuario. La
        percepción sí se apunta ahí, con 0 créditos: se paga con la cuota del plan de cada uno. Si esa cifra sale en 0
        €, es que todavía no has puesto la tarifa de Jev en Ajustes › Coherencia.
      </p>
    </main>
  );
}
