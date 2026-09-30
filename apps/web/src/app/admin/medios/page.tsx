import { asc } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/server/db/cliente";
import { users } from "@/server/db/esquema";
import { VistaAdminMedios } from "./vista-admin-medios";

export const metadata: Metadata = { title: "Medios · Admin" };

/** Medios de todos los usuarios (el layout del admin ya exige el rol). */
export default async function PaginaAdminMedios() {
  const usuarios = await db()
    .select({ id: users.id, nombre: users.name, email: users.email })
    .from(users)
    .orderBy(asc(users.name));
  return (
    <main id="contenido" tabIndex={-1} className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-10 md:px-8">
      <div>
        <h1 className="text-4xl font-bold text-texto">Medios de todos</h1>
        <p className="mt-2 max-w-3xl text-texto-suave">
          Puedes revisar los archivos de cualquier usuario, corregir su título y texto alternativo, y enviarlos a la
          papelera o restaurarlos. Editar la imagen o borrarla para siempre solo puede hacerlo quien la subió.
        </p>
      </div>
      <VistaAdminMedios usuarios={usuarios} />
    </main>
  );
}
