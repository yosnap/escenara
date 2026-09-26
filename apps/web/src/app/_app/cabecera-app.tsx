import Link from "next/link";
import { Logotipo } from "@/components/ui/logotipo";
import { SelectorTema } from "@/components/ui/theme-toggle";
import { esAdmin, type Sesion } from "@/server/auth/sesion";
import { CerrarSesion } from "./cerrar-sesion";
import { EnlaceApp } from "./enlace-app";

/** Cabecera de la aplicación para usuarios con sesión: biblioteca, cuenta y, si procede, admin. */
export function CabeceraApp({ sesion }: { sesion: Sesion }) {
  return (
    <header className="sticky top-0 z-30 border-b border-borde/40 bg-fondo/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-3 md:px-8">
        <div className="flex items-center gap-5">
          <Link href="/" className="text-texto" aria-label="Escenara, volver a la portada">
            <Logotipo />
          </Link>
          <nav aria-label="Aplicación">
            <ul className="flex gap-1 rounded-full bg-elevada p-1">
              <li>
                <EnlaceApp href="/biblioteca">Biblioteca</EnlaceApp>
              </li>
              <li>
                <EnlaceApp href="/cuenta">Cuenta</EnlaceApp>
              </li>
              {esAdmin(sesion) && (
                <li>
                  <EnlaceApp href="/admin/medios">Admin</EnlaceApp>
                </li>
              )}
            </ul>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <SelectorTema />
          <CerrarSesion />
        </div>
      </div>
    </header>
  );
}
