"use client";

import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { Aviso } from "@/components/ui/feedback";
import { Campo, EntradaTexto } from "@/components/ui/field";
import { Paso } from "@/components/ui/paso";
import { TablaPlan } from "@/components/ui/proyecto";
import { impedimentosDelPlan, type ProyectoDetalle } from "@/lib/proyectos";
import { aprobarPlan, editarProyecto } from "../../_componentes/api-proyectos";

/**
 * Plan con su coste y aprobación. Es la pantalla en la que alguien decide gastarse un dinero, así que es toda
 * **zona de claridad**: tabla neutra, cifras siempre etiquetadas como estimación y con la fecha del precio, y
 * un botón que está deshabilitado mientras falte algo, con la lista de lo que falta a la vista.
 *
 * Aprobar **no genera nada**: autoriza. El total que se manda al servidor es el que se tenía delante; si ha
 * cambiado, la aprobación se rechaza y hay que volver a mirarla.
 */
export function PanelAprobacion({
  detalle,
  onCambio,
  onError,
}: {
  detalle: ProyectoDetalle;
  onCambio: (detalle: ProyectoDetalle) => void;
  onError: (mensaje: string) => void;
}) {
  const { plan, proyecto, escenas } = detalle;
  const [presupuesto, setPresupuesto] = useState(plan.presupuestoCreditos);
  const [ocupado, setOcupado] = useState(false);
  const [hecho, setHecho] = useState<string | null>(null);

  const creditos = Number.isNaN(presupuesto) ? 0 : presupuesto;
  // Los impedimentos se recalculan con el presupuesto **que hay escrito**, con la misma función pura que usa el
  // servidor: así el botón se habilita en cuanto se sube lo suficiente y lo que se lee coincide con lo que se
  // comprobará al aprobar.
  const impedimentos = impedimentosDelPlan({
    totalEscenas: escenas.length,
    escenasSinEstimacion: plan.escenasSinEstimacion,
    totalCreditos: plan.totalCreditos,
    presupuestoCreditos: creditos,
    afirmacionesBloqueantes: plan.afirmacionesBloqueantes,
  });
  const bloqueado = impedimentos.length > 0;

  const guardarPresupuesto = async () => {
    setOcupado(true);
    const resultado = await editarProyecto(proyecto.id, { presupuestoCreditos: creditos });
    setOcupado(false);
    if (resultado.ok) {
      setHecho("Presupuesto del proyecto guardado.");
      onCambio(resultado.datos);
    } else onError(resultado.error);
  };

  const aprobar = async () => {
    setOcupado(true);
    setHecho(null);
    const resultado = await aprobarPlan(proyecto.id, creditos, plan.totalCreditos);
    setOcupado(false);
    if (resultado.ok) {
      setHecho("Plan aprobado: queda autorizado con este coste. Producir las escenas llega en una versión siguiente.");
      onCambio(resultado.datos);
    } else onError(resultado.error);
  };

  return (
    <Paso numero={3} titulo="El plan y su coste">
      <div className="flex flex-col gap-4">
        {hecho && <Aviso tono="correcto">{hecho}</Aviso>}

        <TablaPlan plan={{ ...plan, presupuestoCreditos: creditos, impedimentos }} escenas={escenas} />

        <div className="flex flex-wrap items-end gap-3">
          <Campo
            etiqueta="Presupuesto autorizado del proyecto (créditos)"
            ayuda="El plan no se aprueba si su total estimado se pasa de aquí."
          >
            {(p) => (
              <EntradaTexto
                {...p}
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                className="max-w-48"
                value={Number.isNaN(presupuesto) ? "" : presupuesto}
                onChange={(e) => setPresupuesto(e.target.value === "" ? Number.NaN : Number(e.target.value))}
              />
            )}
          </Campo>
          <Boton variante="secundario" onClick={guardarPresupuesto} disabled={ocupado}>
            Guardar presupuesto
          </Boton>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Boton variante="chispa" onClick={aprobar} disabled={ocupado || bloqueado}>
            <ShieldCheck className="size-5" aria-hidden />
            {ocupado ? "Aprobando…" : "Aprobar el plan"}
          </Boton>
          <span className="text-sm text-texto-suave">
            Aprobar congela el modelo, el precio, la versión de la ficha y la plantilla de cada escena. Si editas una
            escena después, su aprobación deja de valer y se te dice.
          </span>
        </div>
      </div>
    </Paso>
  );
}
