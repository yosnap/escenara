import { PanelCoste } from "@/components/ui/coste";
import { DepositoPresupuesto } from "@/components/ui/deposito";
import { EsperaTrabajo, InsigniaEstado } from "@/components/ui/trabajo";
import { type Deposito, ESTADOS_TRABAJO, type EstadoCola, type Estimacion } from "@/lib/generacion";
import { Muestra, Seccion } from "../seccion";

const ESTIMACION: Estimacion = {
  tipo: "animacion",
  modelo: "veo3_lite",
  nombreModelo: "Veo 3.1 Lite",
  conVoz: true,
  unidad: "vídeo de 4 s",
  creditos: 60,
  euros: 0.3,
  saldo: 148,
  alcanza: true,
  superaUmbral: false,
  umbral: 200,
  fuente: "Medido en el prototipo 0.3.0",
  comprobado: "2026-09-27",
  precioAntiguo: false,
  sello: "kie:veo3_lite:vídeo de 4 s@v1",
};

const DEPOSITO: Deposito = {
  autorizado: 2000,
  reservado: 64,
  retenido: 0,
  trabajosEnRevision: 0,
  consumido: 312,
  disponible: 1624,
  topeTrabajo: 500,
  consumidoEuros: 1.56,
};

/** Mismo depósito con parte del presupuesto retenido en trabajos pendientes de revisión. */
const DEPOSITO_RETENIDO: Deposito = { ...DEPOSITO, reservado: 124, retenido: 60, trabajosEnRevision: 1 };

const COLA: EstadoCola = { enCola: 2, enMarcha: 1, workerActivo: true, ultimoLatido: "2026-09-27T06:00:00.000Z" };

/** Componentes del flujo de creación: coste y presupuesto (zonas de claridad) y estado real de un trabajo. */
export function SeccionGeneracion() {
  return (
    <Seccion
      id="generacion"
      titulo="Coste y trabajos"
      descripcion="El panel de coste y el depósito de presupuesto son zonas de claridad: superficie neutra, sin degradados ni movimiento, y siempre etiquetados como estimación. El estado del trabajo es el que informa el proveedor; nunca hay porcentajes calculados por tiempo, y el puesto en la cola es un número contado de verdad."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Muestra titulo="Panel de coste">
          <div className="w-full">
            <PanelCoste estimacion={ESTIMACION} />
          </div>
        </Muestra>
        <div className="flex flex-col gap-4">
          <Muestra titulo="Estados de un trabajo">
            <div className="flex flex-wrap gap-2">
              {ESTADOS_TRABAJO.map((estado) => (
                <InsigniaEstado key={estado} estado={estado} />
              ))}
            </div>
          </Muestra>
          <Muestra titulo="Espera con Chispa">
            <div className="w-full">
              <EsperaTrabajo
                tipo="animacion"
                estado="en_curso"
                estadoProveedor="generating"
                transcurridoSegundos={74}
              />
            </div>
          </Muestra>
          <Muestra titulo="Aviso por encima del umbral">
            <div className="w-full">
              <PanelCoste estimacion={{ ...ESTIMACION, creditos: 240, euros: 1.2, superaUmbral: true }} />
            </div>
          </Muestra>
        </div>
        <Muestra titulo="Depósito de presupuesto">
          <div className="w-full">
            <DepositoPresupuesto deposito={DEPOSITO} cola={COLA} />
          </div>
        </Muestra>
        <Muestra titulo="Depósito con presupuesto retenido">
          <div className="w-full">
            <DepositoPresupuesto deposito={DEPOSITO_RETENIDO} cola={COLA} />
          </div>
        </Muestra>
        <div className="flex flex-col gap-4">
          <Muestra titulo="Espera en cola, con su puesto">
            <div className="w-full">
              <EsperaTrabajo
                tipo="fotograma"
                estado="en_cola"
                estadoProveedor={null}
                transcurridoSegundos={9}
                posicionEnCola={3}
                cola={COLA}
              />
            </div>
          </Muestra>
          <Muestra titulo="Espera sin worker atendiendo">
            <div className="w-full">
              <EsperaTrabajo
                tipo="fotograma"
                estado="en_cola"
                estadoProveedor={null}
                transcurridoSegundos={124}
                posicionEnCola={1}
                cola={{ ...COLA, workerActivo: false }}
              />
            </div>
          </Muestra>
        </div>
      </div>
    </Seccion>
  );
}
