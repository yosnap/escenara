export type Parametros = Record<string, string | string[] | undefined>;
export const PAGINA_ADMIN = 25;
export function texto(p: Parametros, clave: string, maximo = 100): string {
  const valor = p[clave];
  if (Array.isArray(valor)) throw new Error("No se admiten parámetros repetidos.");
  if ((valor?.length ?? 0) > maximo) throw new Error("El filtro es demasiado largo.");
  return valor?.trim() ?? "";
}
export function opcion(p: Parametros, clave: string, opciones: readonly string[]) {
  const valor = texto(p, clave);
  if (valor && !opciones.includes(valor)) throw new Error(`Filtro ${clave} inválido.`);
  return valor;
}
export function pagina(p: Parametros) {
  const valor = texto(p, "pagina");
  if (!valor) return 1;
  if (!/^[1-9]\d{0,4}$/.test(valor)) throw new Error("Página inválida.");
  return Number(valor);
}
export function usuarioFiltro(p: Parametros) {
  const id = texto(p, "usuario");
  if (id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    throw new Error("Usuario inválido.");
  return id;
}
export function intervalo(p: Parametros, ahora = new Date()) {
  const hastaDefault = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate() + 1));
  const fecha = (valor: string, defecto: Date) => {
    if (!valor) return defecto;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) throw new Error("Fecha inválida.");
    const parsed = new Date(`${valor}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== valor)
      throw new Error("Fecha inválida.");
    return parsed;
  };
  const fin = fecha(texto(p, "hasta"), hastaDefault);
  const inicio = fecha(texto(p, "desde"), new Date(fin.getTime() - 30 * 86_400_000));
  if (fin <= inicio || fin.getTime() - inicio.getTime() > 366 * 86_400_000)
    throw new Error("El intervalo debe comprender entre 1 y 366 días.");
  return { inicio, fin };
}
