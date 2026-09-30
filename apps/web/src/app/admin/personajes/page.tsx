import type { Metadata } from "next";
import { esAdmin, exigirAdmin } from "@/server/auth/sesion";
import { pendientesDeRevision } from "@/server/personajes/consulta";
import { VistaRevisionConsentimientos } from "./vista-revision-consentimientos";

export const metadata: Metadata = { title: "Consentimientos · Admin" };
export const dynamic = "force-dynamic";

/**
 * Consentimientos de terceros pendientes de revisión (el layout del admin ya exige el rol; aquí se vuelve a
 * comprobar contra la base de datos porque lo que se enseña son documentos personales de otras personas).
 */
export default async function PaginaAdminPersonajes({ searchParams }: { searchParams: Promise<{ pagina?: string }> }) {
  const sesion = await exigirAdmin("/admin/personajes");
  const { pagina } = await searchParams;
  const pendientes = await pendientesDeRevision({ id: sesion.user.id, esAdmin: esAdmin(sesion) }, Number(pagina ?? 1));
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-5 py-10 md:px-8">
      <div>
        <h1 className="text-4xl font-bold text-texto">Consentimientos de terceros</h1>
        <p className="mt-2 max-w-3xl text-texto-suave">
          Personajes cuya imagen es de otra persona. Mientras no aceptes su documento firmado, el personaje queda en
          revisión y no puede generar nada. Aceptar es una decisión humana: una casilla no verifica a nadie, y estos
          documentos son datos personales de terceros que solo se abren aquí.{" "}
          <strong>Nunca verás sus fotos de referencia</strong> —lo que se revisa es el documento, no la cara de nadie— y
          cada acceso queda registrado con tu cuenta y la fecha.
        </p>
      </div>
      <VistaRevisionConsentimientos
        pendientes={pendientes.elementos}
        total={pendientes.total}
        pagina={pendientes.pagina}
        porPagina={pendientes.porPagina}
      />
    </main>
  );
}
