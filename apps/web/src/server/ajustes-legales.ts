/** Identidad pública de quien opera esta instalación; editable en Admin, sin migración de esquema. */
export interface AjustesLegales {
  legalTitular: string;
  legalNif: string;
  legalDomicilio: string;
  legalCorreo: string;
  legalRegistro: string;
}
export const AJUSTES_LEGALES_POR_DEFECTO: AjustesLegales = {
  legalTitular: "",
  legalNif: "",
  legalDomicilio: "",
  legalCorreo: "",
  legalRegistro: "",
};
const texto = (max: number) => (v: unknown) =>
  typeof v === "string" && v.length <= max && [...v].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127);
export const VALIDACION_LEGALES: Record<keyof AjustesLegales, { valido: (v: unknown) => boolean; mensaje: string }> = {
  legalTitular: { valido: texto(200), mensaje: "Indica un titular de hasta 200 caracteres." },
  legalNif: { valido: texto(40), mensaje: "Indica un NIF/CIF de hasta 40 caracteres." },
  legalDomicilio: { valido: texto(400), mensaje: "Indica un domicilio de hasta 400 caracteres." },
  legalCorreo: {
    valido: (v) => texto(254)(v) && (v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v))),
    mensaje: "Indica un correo de contacto válido.",
  },
  legalRegistro: { valido: texto(400), mensaje: "Indica datos registrales de hasta 400 caracteres." },
};
export const identidadLegalCompleta = (a: AjustesLegales) =>
  Boolean(a.legalTitular && a.legalNif && a.legalDomicilio && a.legalCorreo);
