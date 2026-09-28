import { ProgresoEtapas } from "@/components/ui/feedback";
import { InsigniaAfirmacion, InsigniaEstadoEscena, InsigniaEstadoProyecto, TablaPlan } from "@/components/ui/proyecto";
import { EVALUACION_LISTA, REGLAS_VERSION } from "@/lib/controles";
import { etapasDeTrabajo, textoDeCancelacion } from "@/lib/produccion";
import {
  DIRECCION_SIN_ELEGIR,
  ESTADOS_AFIRMACION,
  ESTADOS_ESCENA,
  ESTADOS_PROYECTO,
  type EscenaVista,
  impedimentosDelPlan,
  type PlanVista,
} from "@/lib/proyectos";
import { Muestra, Seccion } from "../seccion";

/**
 * Insignias de proyecto y la tabla de aprobación del plan (0.17.0). Los datos son inventados aquí a mano para
 * poder ver el componente sin tocar la base de datos.
 *
 * La tabla es zona de claridad: sin degradados, sin movimiento y con la palabra «estimación» y la fecha del
 * precio en cada cifra. La última fila del ejemplo no tiene precio registrado a propósito, para que se vea que
 * una escena sin estimar se dice con su motivo y bloquea la aprobación.
 */

const escena = (id: string, orden: number, accion: string, creditos: number | null): EscenaVista => ({
  direccion: DIRECCION_SIN_ELEGIR,
  referenciaIdentidad: null,
  id,
  proyectoId: "p1",
  orden,
  texto: "",
  accion,
  segundos: 4,
  estado: orden === 1 ? "aprobada" : "borrador",
  aprobadaEn: null,
  motivoInvalidacion: "",
  trabajoId: null,
  // Sin miniatura en el catálogo: la del storyboard real es un medio del usuario, y aquí no hay ninguno.
  fotograma: null,
  estimacion:
    creditos === null
      ? null
      : {
          creditosFotograma: 4,
          creditosAnimacion: creditos - 4,
          creditos,
          euros: creditos * 0.005,
          modeloFotograma: "Nano Banana 2 Lite",
          modeloAnimacion: "Veo 3.1 Lite",
          segundos: 4,
          comprobado: "2026-09-27",
          precioAntiguo: false,
          margen: 30,
          selloFotograma: "kie:nano-banana-2-lite:imagen@v1",
          selloAnimacion: "kie:veo3_lite:vídeo de 4 s@v1",
        },
  afirmaciones: [],
  controles: EVALUACION_LISTA(REGLAS_VERSION),
});

const ESCENAS: EscenaVista[] = [
  escena("s1", 1, "Plano medio en la azotea al amanecer, mirando a cámara.", 84),
  escena("s2", 2, "Primer plano de las manos preparando el café.", 84),
  escena("s3", 3, "Plano general de la ciudad despertando.", null),
];

const TOTAL = ESCENAS.reduce((suma, e) => suma + (e.estimacion?.creditos ?? 0), 0);

const PLAN: PlanVista = {
  creditosAsistente: 0,
  totalCreditos: TOTAL,
  totalEuros: TOTAL * 0.005,
  presupuestoCreditos: 150,
  escenasSinEstimacion: 1,
  afirmacionesPorVerificar: 1,
  afirmacionesBloqueantes: 1,
  comprobado: "2026-09-27",
  margen: 30,
  estadoControl: "listo",
  impedimentos: impedimentosDelPlan({
    totalEscenas: ESCENAS.length,
    escenasSinEstimacion: 1,
    totalCreditos: TOTAL,
    presupuestoCreditos: 150,
    afirmacionesBloqueantes: 1,
  }),
};

export function SeccionProyectos() {
  return (
    <Seccion
      id="proyectos"
      titulo="Proyectos y plan"
      descripcion="Los estados de un proyecto, de una escena y de una afirmación por verificar, y la tabla con la que se aprueba el gasto de un proyecto entero."
    >
      <div className="flex flex-col gap-6">
        <Muestra titulo="Estado del proyecto">
          {ESTADOS_PROYECTO.map((estado) => (
            <InsigniaEstadoProyecto key={estado} estado={estado} />
          ))}
        </Muestra>
        <Muestra titulo="Estado de la escena">
          {ESTADOS_ESCENA.map((estado) => (
            <InsigniaEstadoEscena key={estado} estado={estado} />
          ))}
        </Muestra>
        <Muestra titulo="Afirmación señalada">
          {ESTADOS_AFIRMACION.map((estado) => (
            <InsigniaAfirmacion key={estado} tipo="salud" estado={estado} />
          ))}
        </Muestra>
        <Muestra titulo="Tabla de aprobación del plan">
          <div className="w-full">
            <TablaPlan plan={PLAN} escenas={ESCENAS} />
          </div>
        </Muestra>
        {/*
          Producción de una escena (0.19.0). Las etapas salen de la **misma función pura** que usa la rejilla, con
          un estado y una etapa de verdad: aquí no hay ningún porcentaje que se pueda copiar por descuido.
        */}
        <Muestra titulo="Etapas reales de un trabajo">
          <div className="flex w-full flex-col gap-4">
            <ProgresoEtapas etiqueta="Fotograma generándose" etapas={etapasDeTrabajo("en_curso", null)} />
            <ProgresoEtapas etiqueta="Clip que ha fallado" etapas={etapasDeTrabajo("fallido", "enviado")} />
          </div>
        </Muestra>
        <Muestra titulo="Qué pasa al cancelar una escena">
          <div className="flex w-full flex-col gap-2 text-texto">
            <p>{textoDeCancelacion({ seCancelan: 1, seCobraran: 1 })}</p>
            <p>{textoDeCancelacion({ seCancelan: 0, seCobraran: 0 })}</p>
          </div>
        </Muestra>
      </div>
    </Seccion>
  );
}
