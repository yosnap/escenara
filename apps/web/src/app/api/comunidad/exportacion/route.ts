import { exportarMiComunidad } from "@/server/comunidad/exportacion";
import { manejador } from "@/server/comunidad/http";

export const dynamic = "force-dynamic";

/**
 * Tus publicaciones (en cualquier estado, con el motivo de un rechazo) y tus logros, en JSON. Solo lo tuyo. También
 * durante el periodo de gracia del borrado de la cuenta: es lo que te llevas antes de irte.
 */
export const GET = manejador(
  async (_: Request, __: unknown, actor) =>
    Response.json(await exportarMiComunidad(actor), {
      headers: {
        "Content-Disposition": 'attachment; filename="escenara-comunidad.json"',
        "Cache-Control": "private, no-store",
      },
    }),
  { permitirBorradoProgramado: true },
);
