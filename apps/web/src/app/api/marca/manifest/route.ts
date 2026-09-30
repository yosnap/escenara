import { marcaAplicada } from "@/server/marca/publicada";

export const dynamic = "force-dynamic";

/**
 * Manifiesto de la aplicación con los iconos de la marca publicada. Solo se enlaza desde las páginas cuando hay una
 * marca publicada con iconos; sin ella responde 404 y la instalación sigue exactamente como antes.
 */
export async function GET(): Promise<Response> {
  const marca = await marcaAplicada();
  if (!marca?.iconos.icono192 || !marca.iconos.icono512) {
    return Response.json({ error: "Esta instalación no tiene iconos propios." }, { status: 404 });
  }
  return Response.json(
    {
      name: marca.nombre,
      short_name: marca.nombre,
      description: marca.descripcion,
      start_url: "/",
      display: "standalone",
      icons: [
        { src: marca.iconos.icono192, sizes: "192x192", type: "image/png" },
        { src: marca.iconos.icono512, sizes: "512x512", type: "image/png" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-cache" } },
  );
}
