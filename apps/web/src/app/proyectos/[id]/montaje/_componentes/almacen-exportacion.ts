import type { EstadoExportacion, ExportacionVista } from "@/lib/montaje";
import { consultarExportacion } from "./api-montaje";

/**
 * Sondeo del estado de una exportación como **almacén externo** (`useSyncExternalStore`): los temporizadores viven
 * fuera de React, arrancan cuando alguien se suscribe y se paran al desmontarse el componente. En Escenara no se
 * usa `useEffect` directo, y esta es la forma sin él de mantener algo vivo mientras se ve en pantalla.
 *
 * El intervalo es corto y **constante**, al contrario que el de los trabajos de generación: el render corre en
 * esta misma máquina, no hay proveedor al que preguntar, y cada consulta es una lectura de una fila que no
 * reevalúa los controles ni recompone el montaje. Lo que se muestra es la **etapa real** de FFmpeg, no un reloj.
 */

const MS_ENTRE_CONSULTAS = 2500;

/** Una exportación que ya no puede cambiar sola: no hay nada que sondear. */
export const exportacionTerminada = (estado: EstadoExportacion): boolean => estado === "listo" || estado === "fallido";

export interface EstadoSondeoExportacion {
  exportacion: ExportacionVista;
  consultando: boolean;
  /** Fallo de la **consulta**, no del render: el estado de la exportación no cambia por esto. */
  error: string | null;
}

export interface AlmacenExportacion {
  subscribe: (escuchar: () => void) => () => void;
  obtener: () => EstadoSondeoExportacion;
  /**
   * Consulta al momento. Es también cómo se **renueva la URL de descarga**: la del MP4 es temporal, así que una
   * pestaña abierta un buen rato vuelve a pedirla en lugar de ofrecer un enlace caducado.
   */
  reconsultar: () => void;
}

export function crearAlmacenExportacion(
  inicial: ExportacionVista,
  alCambiar?: (e: ExportacionVista) => void,
): AlmacenExportacion {
  let estado: EstadoSondeoExportacion = { exportacion: inicial, consultando: false, error: null };
  const oyentes = new Set<() => void>();
  let temporizador: ReturnType<typeof setTimeout> | null = null;
  let vivo = false;

  const publicar = (cambios: Partial<EstadoSondeoExportacion>) => {
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
    temporizador = setTimeout(() => void consultar(), MS_ENTRE_CONSULTAS);
  };

  const arrancar = () => {
    if (vivo || oyentes.size === 0 || exportacionTerminada(estado.exportacion.estado)) return;
    vivo = true;
    programar();
  };

  const consultar = async () => {
    if (estado.consultando) return;
    publicar({ consultando: true });
    const respuesta = await consultarExportacion(estado.exportacion.id);
    if (respuesta.ok) {
      publicar({ exportacion: respuesta.datos, consultando: false, error: null });
      alCambiar?.(respuesta.datos);
      if (exportacionTerminada(respuesta.datos.estado)) {
        parar();
        return;
      }
    } else {
      // Un fallo de red no para el sondeo: el render sigue en marcha en el servidor aunque esta consulta falle.
      publicar({ consultando: false, error: respuesta.error });
    }
    if (vivo) programar();
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
    reconsultar: () => void consultar(),
  };
}
