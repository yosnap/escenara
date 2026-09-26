/**
 * Las herramientas de administración (catálogo de componentes y API de medios) solo están disponibles
 * en desarrollo, o en producción con `ESCENARA_ADMIN_COMPONENTES=1`, hasta que existan cuentas (0.7.0).
 */
export function adminDisponible(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ESCENARA_ADMIN_COMPONENTES === "1";
}
