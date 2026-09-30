import { LIMITE_SUBIDA } from "@/server/marca/activos";
import { exigirRitmoDeMarca, leerArchivo, manejador } from "@/server/marca/http";
import { quitarLogoDelKit, subirLogoDelKit } from "@/server/marca/kit";

export const dynamic = "force-dynamic";

/** Sube o sustituye el logotipo de tu kit. Se comprueba por su contenido y se guarda en PNG. */
export const POST = manejador(async (peticion: Request, __: unknown, actor) => {
  await exigirRitmoDeMarca(actor);
  const { archivo } = await leerArchivo(peticion, LIMITE_SUBIDA.logotipo);
  return Response.json({ kit: await subirLogoDelKit(actor, archivo) }, { status: 201 });
});

export const DELETE = manejador(async (_: Request, __: unknown, actor) =>
  Response.json({ kit: await quitarLogoDelKit(actor) }),
);
