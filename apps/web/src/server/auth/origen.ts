/** Devuelve el mensaje del rechazo de origen, o `null` si la petición procede de la aplicación. */
export function errorDeOrigen(
  peticion: Request,
  urlPublica = process.env.BETTER_AUTH_URL ?? peticion.url,
): string | null {
  const origen = peticion.headers.get("origin");
  if (!origen) return "Petición sin origen: vuelve a cargar la página.";
  let urlOrigen: URL;
  try {
    urlOrigen = new URL(origen);
  } catch {
    return "Origen no válido.";
  }
  // Origin solo admite protocolo, dominio y puerto; no credenciales, rutas ni orígenes opacos.
  if (!["http:", "https:"].includes(urlOrigen.protocol) || origen !== urlOrigen.origin) {
    return "Origen no válido.";
  }
  // Next puede usar 0.0.0.0:3021 detrás del proxy. La URL pública configurada es la autoridad,
  // nunca Host/X-Forwarded-Host, que pueden contener valores enviados por el cliente.
  try {
    const destino = new URL(urlPublica);
    if (["http:", "https:"].includes(destino.protocol) && urlOrigen.origin === destino.origin) return null;
  } catch {
    // Una configuración incorrecta falla de forma cerrada.
  }
  return "Esta petición no viene de Escenara.";
}
