import { GRUPOS_ADMIN } from "./enlaces-admin";
import { EnlaceAdmin } from "./navegacion-admin";

export function MenuAdmin() {
  return (
    <nav aria-label="Secciones de administración" className="space-y-4 p-4">
      {GRUPOS_ADMIN.map((grupo) => (
        <div key={grupo.nombre}>
          <p className="mb-1 text-xs font-bold text-texto-suave">{grupo.nombre}</p>
          <ul>
            {grupo.paginas.map(([href, nombre]) => (
              <li key={href}>
                <EnlaceAdmin
                  href={href}
                  className="block min-h-11 rounded-control px-3 py-2 text-sm hover:bg-elevada aria-[current=page]:bg-acento aria-[current=page]:text-sobre-acento"
                >
                  {nombre}
                </EnlaceAdmin>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <a href="/proyectos" target="_blank" rel="noopener noreferrer" className="block min-h-11 py-2 text-acento">
        Abrir aplicación ↗
      </a>
      <a
        href="https://docs.escenara.com"
        target="_blank"
        rel="noopener noreferrer"
        className="block min-h-11 py-2 text-acento"
      >
        Documentación ↗
      </a>
    </nav>
  );
}
