export interface AjustesPrivacidad {
  retencionAuditoriaDias: number;
  retencionCorreosDias: number;
}
/** Cero: conservación hasta revisión manual. No activa limpieza automática. */
export const AJUSTES_PRIVACIDAD_POR_DEFECTO: AjustesPrivacidad = { retencionAuditoriaDias: 0, retencionCorreosDias: 0 };
const valido = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 3650;
export const VALIDACION_PRIVACIDAD = {
  retencionAuditoriaDias: { valido, mensaje: "Usa 0 (revisión manual) o entre 1 y 3650 días." },
  retencionCorreosDias: { valido, mensaje: "Usa 0 (revisión manual) o entre 1 y 3650 días." },
};
