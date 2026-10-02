/** Las instalaciones con SMTP guardado conservan su transporte hasta elegir otro explícitamente. */
export function proveedorCorreoInicial(filas: { key: string; value: unknown }[]): "resend" | "smtp" {
  const proveedor = filas.find((f) => f.key === "correoProveedor")?.value;
  if (proveedor === "resend" || proveedor === "smtp") return proveedor;
  return filas.some((f) => ["smtpHost", "smtpPuerto", "smtpUsuario", "smtpSeguro"].includes(f.key)) ? "smtp" : "resend";
}
