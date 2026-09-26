/**
 * Control de gasto del prototipo: ninguna generación se lanza si lo gastado más la
 * estimación máxima de la siguiente supera el tope. El registro se guarda en disco.
 */
export const TOPE_USD = 0.5;

export interface Movimiento {
  paso: string;
  proveedor: "google" | "kie";
  modelo: string;
  estimadoUsd: number;
  realUsd: number | null;
  fuenteReal: string;
  fecha: string;
}

export interface Registro {
  topeUsd: number;
  movimientos: Movimiento[];
}

export function gastado(registro: Registro): number {
  // Si un coste real no se conoce, cuenta la estimación: nunca se asume gratis.
  return registro.movimientos.reduce((total, m) => total + (m.realUsd ?? m.estimadoUsd), 0);
}

export function puedeLanzar(registro: Registro, estimadoUsd: number): { ok: boolean; restante: number } {
  const restante = registro.topeUsd - gastado(registro);
  return { ok: estimadoUsd <= restante + 1e-9, restante };
}

export async function leerRegistro(ruta: string): Promise<Registro> {
  const fichero = Bun.file(ruta);
  if (!(await fichero.exists())) return { topeUsd: TOPE_USD, movimientos: [] };
  return (await fichero.json()) as Registro;
}

export async function guardarRegistro(ruta: string, registro: Registro): Promise<void> {
  await Bun.write(ruta, `${JSON.stringify(registro, null, 2)}\n`);
}
