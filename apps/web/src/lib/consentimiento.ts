export interface EleccionOpcional {
  version: string;
  aceptados: string[];
}
/** Sin servicios identificados no existe ninguna carga opcional autorizada. */
export const SERVICIOS_OPCIONALES: readonly string[] = [];
export const VERSION_CONSENTIMIENTO = "sin-servicios-v1";
export function permiteServicio(servicio: string, configurado: boolean, eleccion: unknown): boolean {
  if (!configurado || !SERVICIOS_OPCIONALES.includes(servicio) || !eleccion || typeof eleccion !== "object")
    return false;
  const datos = eleccion as Partial<EleccionOpcional>;
  return (
    datos.version === VERSION_CONSENTIMIENTO && Array.isArray(datos.aceptados) && datos.aceptados.includes(servicio)
  );
}
export function leerEleccionOpcional(almacenamiento: Pick<Storage, "getItem">): unknown {
  try {
    return JSON.parse(almacenamiento.getItem("escenara-consentimiento-opcional") ?? "null");
  } catch {
    return null;
  }
}
export function revocarOpcionales(almacenamiento: Pick<Storage, "removeItem">): void {
  try {
    almacenamiento.removeItem("escenara-consentimiento-opcional");
  } catch {
    /* Sin almacenamiento no se autoriza ninguna carga. */
  }
}
