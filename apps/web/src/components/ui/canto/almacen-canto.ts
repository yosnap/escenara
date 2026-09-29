import type { CantoVista } from "@/lib/canto";

export interface EstadoCanto {
  canto: CantoVista | null;
  ocupado: boolean;
  error: string | null;
}

/** Carga la vista al suscribirse y conserva un único estado para el editor y la confirmación. */
export function crearAlmacenCanto(escenaId: string) {
  let estado: EstadoCanto = { canto: null, ocupado: false, error: null };
  let iniciado = false;
  const oyentes = new Set<() => void>();
  const avisar = (cambio: Partial<EstadoCanto>) => {
    estado = { ...estado, ...cambio };
    for (const oyente of oyentes) oyente();
  };
  const url = `/api/escenas/${escenaId}/canto`;
  const leer = async (respuesta: Response): Promise<Record<string, unknown>> => {
    const datos = await respuesta.json().catch(() => null);
    if (!respuesta.ok) throw new Error(datos?.error ?? "No se han podido cargar los datos del canto.");
    return datos;
  };
  const cargar = async () => {
    avisar({ ocupado: true, error: null });
    try {
      const datos = await leer(await fetch(url));
      avisar({ canto: datos.canto as CantoVista });
    } catch (error) {
      avisar({ error: (error as Error).message });
    } finally {
      avisar({ ocupado: false });
    }
  };
  const cambiar = async (ruta: string, metodo: string, cuerpo?: unknown) => {
    avisar({ ocupado: true, error: null });
    try {
      const datos = await leer(
        await fetch(ruta, {
          method: metodo,
          headers: cuerpo ? { "Content-Type": "application/json" } : undefined,
          body: cuerpo ? JSON.stringify(cuerpo) : undefined,
        }),
      );
      if (datos.canto) avisar({ canto: datos.canto as CantoVista });
      else await cargar();
      return true;
    } catch (error) {
      avisar({ error: (error as Error).message });
      return false;
    } finally {
      avisar({ ocupado: false });
    }
  };
  return {
    obtener: () => estado,
    subscribe: (oyente: () => void) => {
      oyentes.add(oyente);
      if (!iniciado) {
        iniciado = true;
        void cargar();
      }
      return () => oyentes.delete(oyente);
    },
    cargar,
    audio: (medioId: string | null) => (medioId ? cambiar(url, "PUT", { medioId }) : cambiar(url, "DELETE")),
  };
}
