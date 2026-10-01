import { CargarAvisoCookies } from "./cargar-aviso-cookies";

export function PieLegal() {
  return (
    <footer className="border-t border-borde/40 bg-fondo px-5 py-4 text-texto-suave">
      <nav
        aria-label="Información legal"
        className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-4"
      >
        {[
          ["aviso", "Aviso legal"],
          ["privacidad", "Privacidad"],
          ["cookies", "Cookies"],
          ["terminos", "Términos de uso"],
          ["contenido", "Uso de imagen y contenido IA"],
        ].map(([ruta, texto]) => (
          <a
            key={ruta}
            href={`/legal/${ruta}`}
            className="inline-flex min-h-11 items-center text-sm underline-offset-4 hover:underline"
          >
            {texto}
          </a>
        ))}
        <CargarAvisoCookies />
      </nav>
    </footer>
  );
}
