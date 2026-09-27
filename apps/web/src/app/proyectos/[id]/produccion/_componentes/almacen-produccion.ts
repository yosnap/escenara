import { escenaEnVuelo, type ProduccionVista } from "@/lib/produccion";
import { consultarProduccion } from "./api-produccion";

/**
 * Sondeo del estado de producción como **almacén externo** (`useSyncExternalStore`): los temporizadores viven
 * fuera de React, arrancan cuando alguien se suscribe y se paran al desmontarse. En Escenara no se usa
 * `useEffect` directo, y esta es la forma sin él de mantener algo vivo mientras se ve en pantalla.
 *
 * El sondeo **solo existe mientras hay algo en vuelo**: si ninguna escena tiene un trabajo en marcha, no hay nada
 * que pueda cambiar solo y se para. El intervalo crece de 4 s a 15 s, y el servidor guarda además su mínimo entre
 * consultas al proveedor por trabajo, así que preguntar de más no se traduce en más peticiones al proveedor.
 *
 * Lo que este fichero **no** hace: calcular ningún progreso. Lo que se pinta son las etapas y los estados que
 * llegan del servidor.
 */

const MS_PRIMERA_CONSULTA = 4000;
const MS_MAXIMO_ENTRE_CONSULTAS = 15_000;
const CRECIMIENTO = 1.5;

export interface EstadoProduccion {
  produccion: ProduccionVista;
  consultando: boolean;
  /** Fallo de la consulta, no de la producción: el estado de las escenas no cambia por esto. */
  error: string | null;
}

export interface AlmacenProduccion {
  subscribe: (escuchar: () => void) => () => void;
  obtener: () => EstadoProduccion;
  /** Adopta el estado que ha devuelto una acción (producir, aprobar, regenerar, cancelar). */
  aplicar: (produccion: ProduccionVista) => void;
  /** Consulta al momento. No gasta nada: la ruta de producción es de lectura. */
  refrescar: () => void;
}

const hayAlgoEnVuelo = (produccion: ProduccionVista) => produccion.escenas.some(escenaEnVuelo);

export function crearAlmacenProduccion(inicial: ProduccionVista): AlmacenProduccion {
  let estado: EstadoProduccion = { produccion: inicial, consultando: false, error: null };
  const oyentes = new Set<() => void>();
  let temporizador: ReturnType<typeof setTimeout> | null = null;
  let espera = MS_PRIMERA_CONSULTA;
  let vivo = false;

  const publicar = (cambios: Partial<EstadoProduccion>) => {
    estado = { ...estado, ...cambios };
    for (const oyente of oyentes) oyente();
  };

  const parar = () => {
    vivo = false;
    if (temporizador) clearTimeout(temporizador);
    temporizador = null;
  };

  const programar = () => {
    if (temporizador) clearTimeout(temporizador);
    temporizador = setTimeout(() => {
      espera = Math.min(MS_MAXIMO_ENTRE_CONSULTAS, espera * CRECIMIENTO);
      void consultar();
    }, espera);
  };

  const arrancar = () => {
    if (vivo || oyentes.size === 0 || !hayAlgoEnVuelo(estado.produccion)) return;
    vivo = true;
    espera = MS_PRIMERA_CONSULTA;
    programar();
  };

  const aplicar = (produccion: ProduccionVista) => {
    publicar({ produccion, consultando: false, error: null });
    if (hayAlgoEnVuelo(produccion)) arrancar();
    else parar();
  };

  const consultar = async () => {
    if (estado.consultando) return;
    publicar({ consultando: true });
    const respuesta = await consultarProduccion(estado.produccion.proyectoId);
    if (respuesta.ok) aplicar(respuesta.datos);
    else publicar({ consultando: false, error: respuesta.error });
    if (vivo && hayAlgoEnVuelo(estado.produccion)) programar();
    else parar();
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
    aplicar,
    refrescar: () => void consultar(),
  };
}
