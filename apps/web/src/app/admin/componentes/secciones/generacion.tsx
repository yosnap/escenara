import { PanelCoste } from "@/components/ui/coste";
import { EsperaTrabajo, InsigniaEstado } from "@/components/ui/trabajo";
import { ESTADOS_TRABAJO, type Estimacion } from "@/lib/generacion";
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

/** Componentes del flujo de creación: coste (zona de claridad) y estado real de un trabajo. */
export function SeccionGeneracion() {
  return (
    <Seccion
      id="generacion"
      titulo="Coste y trabajos"
      descripcion="El panel de coste es zona de claridad: superficie neutra, sin degradados ni movimiento, y siempre etiquetado como estimación. El estado del trabajo es el que informa el proveedor; nunca hay porcentajes calculados por tiempo."
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
      </div>
    </Seccion>
  );
}
