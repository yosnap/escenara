import { esAdmin, type Sesion } from "@/server/auth/sesion";
import { BarraPortada } from "../_portada/barra-portada";
import { AvisoSesion } from "./aviso-sesion";
import { CerrarSesion } from "./cerrar-sesion";
import { EnlaceApp } from "./enlace-app";

/**
 * Cabecera de la aplicación para usuarios con sesión: proyectos, crear, personajes, productos, lugares, biblioteca,
 * comparar, comunidad, cuenta y, si procede, admin.
 *
 * El menú general se conserva arriba; las herramientas del usuario van debajo y se ajustan en varias líneas
 * cuando no caben. Documentación y GitHub pertenecen al menú general, no al de herramientas.
 *
 * Sin menú desplegable a propósito: esconder secciones detrás de «Más» obliga a abrir para saber dónde estás, y
 * el estado activo tiene que verse de un vistazo.
 */
export function CabeceraApp({ sesion }: { sesion: Sesion }) {
  return (
    <BarraPortada conSesion>
      <nav aria-label="Aplicación">
        <ul className="flex max-w-full flex-wrap items-center gap-1 rounded-3xl bg-elevada p-1">
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
            <EnlaceApp href="/comparar">Comparar</EnlaceApp>
          </li>
          <li className="shrink-0">
            <EnlaceApp href="/comunidad">Comunidad</EnlaceApp>
          </li>
          <li className="shrink-0">
            <EnlaceApp href="/cuenta">Cuenta</EnlaceApp>
          </li>
          {esAdmin(sesion) && (
            <li className="shrink-0">
              <EnlaceApp href="/admin">Admin</EnlaceApp>
            </li>
          )}
          <li className="ml-auto max-w-full shrink-0">
            <CerrarSesion />
          </li>
        </ul>
      </nav>
      <AvisoSesion />
    </BarraPortada>
  );
}
