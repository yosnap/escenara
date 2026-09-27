import { esEstadoActivo, type TrabajoVista } from "@/lib/generacion";
import { consultarTrabajo, reconsultarTrabajo } from "./api-generacion";

/**
 * Sondeo del estado de un trabajo como almacén externo (`useSyncExternalStore`): los temporizadores viven
 * fuera de React, arrancan cuando alguien se suscribe y se paran al desmontarse el componente. En Escenara
 * no se usa `useEffect` directo, y esta es la forma sin él de mantener algo vivo mientras se ve en pantalla.
 *
 * El intervalo crece de 4 s a 15 s: el servidor además guarda un mínimo entre consultas por trabajo, así
 * que preguntar de más no se traduce en más peticiones al proveedor.
 */

const MS_PRIMERA_CONSULTA = 4000;
const MS_MAXIMO_ENTRE_CONSULTAS = 15_000;
const CRECIMIENTO = 1.5;
/** El tiempo transcurrido se actualiza cada segundo: es un dato medido, no una barra de progreso. */
const MS_TIC = 1000;

export interface EstadoSondeo {
  trabajo: TrabajoVista;
  transcurridoSegundos: number;
  consultando: boolean;
  /** Fallo de la consulta (no del trabajo): el estado del trabajo no cambia por esto. */
  error: string | null;
}

export interface AlmacenTrabajo {
  subscribe: (escuchar: () => void) => () => void;
  obtener: () => EstadoSondeo;
  /** Consulta al momento, aunque el trabajo esté «sin respuesta»; nunca reenvía la generación. */
  reconsultar: () => void;
}

function transcurrido(trabajo: TrabajoVista): number {
  const desde = new Date(trabajo.creadoEn).getTime();
  const hasta = trabajo.terminadoEn ? new Date(trabajo.terminadoEn).getTime() : Date.now();
  return Math.max(0, (hasta - desde) / 1000);
}

export function crearAlmacenTrabajo(inicial: TrabajoVista, alCambiar?: (t: TrabajoVista) => void): AlmacenTrabajo {
  let estado: EstadoSondeo = {
    trabajo: inicial,
    transcurridoSegundos: transcurrido(inicial),
    consultando: false,
    error: null,
  };
  const oyentes = new Set<() => void>();
  let temporizadorConsulta: ReturnType<typeof setTimeout> | null = null;
  let temporizadorTic: ReturnType<typeof setInterval> | null = null;
  let espera = MS_PRIMERA_CONSULTA;
  let vivo = false;

  const publicar = (cambios: Partial<EstadoSondeo>) => {
    estado = { ...estado, ...cambios };
    for (const oyente of oyentes) oyente();
  };

  const parar = () => {
    vivo = false;
    if (temporizadorConsulta) clearTimeout(temporizadorConsulta);
    if (temporizadorTic) clearInterval(temporizadorTic);
    temporizadorConsulta = null;
    temporizadorTic = null;
  };

  /** Pone en marcha el sondeo mientras haya alguien mirando y el trabajo pueda cambiar solo. */
  const arrancar = () => {
    if (vivo || oyentes.size === 0 || !esEstadoActivo(estado.trabajo.estado)) return;
    vivo = true;
    programar();
    temporizadorTic = setInterval(() => publicar({ transcurridoSegundos: transcurrido(estado.trabajo) }), MS_TIC);
  };

  const aplicar = (trabajo: TrabajoVista) => {
    publicar({ trabajo, transcurridoSegundos: transcurrido(trabajo), consultando: false, error: null });
    alCambiar?.(trabajo);
    // Un trabajo que vuelve a estar en marcha (se ha reconsultado uno «sin respuesta») se sigue otra vez.
    if (esEstadoActivo(trabajo.estado)) arrancar();
    else parar();
  };

  const consultar = async (forzada: boolean) => {
    if (estado.consultando) return;
    publicar({ consultando: true });
    const respuesta = forzada ? await reconsultarTrabajo(estado.trabajo.id) : await consultarTrabajo(estado.trabajo.id);
    if (respuesta.ok) aplicar(respuesta.datos);
    else publicar({ consultando: false, error: respuesta.error });
    if (vivo && esEstadoActivo(estado.trabajo.estado)) programar();
  };

  const programar = () => {
    if (temporizadorConsulta) clearTimeout(temporizadorConsulta);
    temporizadorConsulta = setTimeout(() => {
      espera = Math.min(MS_MAXIMO_ENTRE_CONSULTAS, espera * CRECIMIENTO);
      void consultar(false);
    }, espera);
  };

  return {
    subscribe(escuchar) {
      oyentes.add(escuchar);
      arrancar();
      return () => {
        oyentes.delete(escuchar);
        if (oyentes.size === 0) parar();
      };
    },
    obtener: () => estado,
    reconsultar: () => void consultar(true),
  };
}
