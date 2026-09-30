import { EnlaceLogotipo } from "@/components/ui/enlace-logotipo";
import { SelectorTema } from "@/components/ui/theme-toggle";
import { esAdmin, type Sesion } from "@/server/auth/sesion";
import { CerrarSesion } from "./cerrar-sesion";
import { EnlaceApp } from "./enlace-app";

/**
 * Cabecera de la aplicación para usuarios con sesión: proyectos, crear, personajes, productos, lugares, biblioteca,
 * cuenta y, si procede, admin.
 *
 * **La navegación va en su propia fila**, igual que en el admin y por el mismo motivo: con «Proyectos» (0.17.0)
 * la tira de píldoras dejó de caber incluso a 1920 px y empujaba el selector de tema y «Cerrar sesión» a otra
 * línea. Con la fila propia el orden es el mismo a cualquier ancho; en pantallas estrechas la tira desplaza en
 * horizontal, así que ninguna sección queda inalcanzable en un móvil.
 *
 * Sin menú desplegable a propósito: esconder secciones detrás de «Más» obliga a abrir para saber dónde estás, y
 * el estado activo tiene que verse de un vistazo.
 */
export function CabeceraApp({ sesion }: { sesion: Sesion }) {
  return (
    <header className="sticky top-0 z-30 border-b border-borde/40 bg-fondo/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-3 md:px-8">
        <div className="flex items-center justify-between gap-4">
          <EnlaceLogotipo href="/" accion="volver a la portada" className="text-texto" />
          <div className="flex items-center gap-2">
            <SelectorTema />
            <CerrarSesion />
          </div>
        </div>

        <nav aria-label="Aplicación">
          <ul className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-elevada p-1">
            <li className="shrink-0">
              <EnlaceApp href="/proyectos">Proyectos</EnlaceApp>
            </li>
            <li className="shrink-0">
              <EnlaceApp href="/crear">Crear</EnlaceApp>
            </li>
            <li className="shrink-0">
              <EnlaceApp href="/personajes">Personajes</EnlaceApp>
            </li>
            <li className="shrink-0">
              <EnlaceApp href="/productos">Productos</EnlaceApp>
            </li>
            <li className="shrink-0">
              <EnlaceApp href="/lugares">Lugares</EnlaceApp>
            </li>
            <li className="shrink-0">
              <EnlaceApp href="/biblioteca">Biblioteca</EnlaceApp>
            </li>
            <li className="shrink-0">
              <EnlaceApp href="/cuenta">Cuenta</EnlaceApp>
            </li>
            {esAdmin(sesion) && (
              <li className="shrink-0">
                <EnlaceApp href="/admin/medios">Admin</EnlaceApp>
              </li>
            )}
          </ul>
        </nav>
      </div>
    </header>
  );
}
