import { describe, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { auditar } from "@/lib/axe-de-prueba";
import { FORMATOS_MONTAJE, type FormatoMontaje } from "@/lib/formatos";
import type { ProyectoVista } from "@/lib/proyectos";
import type { Sesion } from "@/server/auth/sesion";

/**
 * **axe sobre las pantallas principales** con datos de ejemplo: la portada, el acceso, la biblioteca, la cuenta, los
 * proyectos y el catálogo del admin, pintadas como las sirve el servidor (cabecera, `main#contenido` y su `h1`).
 * Ninguna puede tener violaciones serias o críticas. Producción, revisión, montaje y «Crear» están en
 * `accesibilidad-proyectos.test.tsx`.
 */

// Sin enrutador de Next: `useRouter` vacío y el resto del módulo tal cual (otros ficheros usan `notFound`).
const navegacion = await import("next/navigation");
mock.module("next/navigation", () => ({
  ...navegacion,
  useRouter: () => ({ refresh() {}, push() {}, replace() {} }),
  usePathname: () => "/proyectos",
  useSearchParams: () => new URLSearchParams(),
}));

const { CabeceraApp } = await import("./_app/cabecera-app");
const { BarraPortada } = await import("./_portada/barra-portada");
const { CabeceraPortada } = await import("./_portada/cabecera");
const { ComoFunciona } = await import("./_portada/como-funciona");
const { Confianza } = await import("./_portada/confianza");
const { Escaparate } = await import("./_portada/escaparate");
const { Pie } = await import("./_portada/pie");
const { FormularioEntrar } = await import("./(cuenta)/_componentes/formulario-entrar");
const { FormularioRegistro } = await import("./(cuenta)/_componentes/formulario-registro");
const { VistaBiblioteca } = await import("./biblioteca/_componentes/vista-biblioteca");
const { Perfil } = await import("./cuenta/_componentes/perfil");
const { Preferencias } = await import("./cuenta/_componentes/preferencias");
const { Credenciales } = await import("./cuenta/_componentes/credenciales");
const { Compatibles } = await import("./cuenta/_componentes/compatibles");
const { CambiarContrasena } = await import("./cuenta/_componentes/cambiar-contrasena");
const { Passkeys } = await import("./cuenta/_componentes/passkeys");
const { Sesiones } = await import("./cuenta/_componentes/sesiones");
const { ListaProyectos } = await import("./proyectos/_componentes/lista-proyectos");
const { Catalogo } = await import("./admin/componentes/catalogo");
const { ListaLugares } = await import("./lugares/_componentes/lista-lugares");
const { FichaLugar } = await import("./lugares/_componentes/ficha-lugar");
const { CabeceraAdmin } = await import("./admin/cabecera-admin");

const SESION = {
  user: { id: "u1", name: "Ana", email: "ana@ejemplo.test", role: "user", emailVerified: true },
  session: { id: "s1" },
} as unknown as Sesion;

/** Página de la aplicación como la sirve el servidor: cabecera con la navegación y el contenido en `main`. */
const paginaApp = (titulo: string, contenido: ReactNode) =>
  renderToStaticMarkup(
    <div className="min-h-dvh bg-fondo">
      <CabeceraApp sesion={SESION} />
      <main id="contenido" tabIndex={-1}>
        <h1>{titulo}</h1>
        {contenido}
      </main>
    </div>,
  );

const sinGraves = async (html: string) => expect((await auditar(html)).graves).toEqual([]);

describe("navegación general y herramientas del usuario", () => {
  for (const rol of ["user", "admin"] as const) {
    test(`menús separados y salida accesible para ${rol}`, () => {
      const ventana = new Window();
      ventana.document.body.innerHTML = renderToStaticMarkup(
        <CabeceraApp sesion={{ ...SESION, user: { ...SESION.user, role: rol } }} />,
      );
      const documento = ventana.document;
      const menus = documento.querySelectorAll("nav");
      expect([...menus].map((menu) => menu.getAttribute("aria-label"))).toEqual([
        "Secciones de la portada",
        "Aplicación",
      ]);
      expect(menus[0]?.querySelector('a[href="https://docs.escenara.com"]')).not.toBeNull();
      expect(menus[0]?.querySelector('a[href="/#escaparate"]')).not.toBeNull();
      expect(menus[1]?.querySelector('a[href="https://docs.escenara.com"]')).toBeNull();
      expect(menus[1]?.querySelector('a[href="/crear"]')).not.toBeNull();
      expect(menus[1]?.querySelector('a[href="/admin"]') !== null).toBe(rol === "admin");
      const salida = menus[1]?.querySelector('button[aria-label="Cerrar sesión"]');
      expect(salida).not.toBeNull();
      expect(salida?.textContent).toBe("");
      expect(salida?.getAttribute("title")).toBe("Cerrar sesión");
      ventana.happyDOM.abort();
    });
  }
});

describe("axe: portada y acceso", () => {
  test("portada", async () => {
    const html = renderToStaticMarkup(
      <>
        <BarraPortada conSesion={false} />
        <main id="contenido" tabIndex={-1}>
          <CabeceraPortada />
          <Escaparate />
          <ComoFunciona />
          <Confianza />
        </main>
        <Pie version="0.45.0" />
      </>,
    );
    await sinGraves(html);
  });

  const cuenta = (contenido: ReactNode) =>
    renderToStaticMarkup(
      <div>
        <header>
          <a href="/">Escenara, volver a la portada</a>
        </header>
        <main id="contenido" tabIndex={-1}>
          {contenido}
        </main>
      </div>,
    );

  test("entrar, con proveedores externos y un aviso", async () => {
    await sinGraves(
      cuenta(
        <FormularioEntrar
          volver="/proyectos"
          proveedores={["google", "github"]}
          registroAbierto
          aviso="Has cerrado la sesión."
        />,
      ),
    );
  });

  test("registro abierto y cerrado", async () => {
    await sinGraves(cuenta(<FormularioRegistro proveedores={["google"]} registroAbierto />));
    await sinGraves(cuenta(<FormularioRegistro proveedores={[]} registroAbierto={false} />));
  });
});

describe("axe: pantallas con sesión", () => {
  test("biblioteca", async () => {
    await sinGraves(
      paginaApp(
        "Tu biblioteca",
        <VistaBiblioteca
          colecciones={[{ id: "c1", nombre: "Verano", total: 3 }]}
          espacio={{ usadoBytes: 30 * 1024 * 1024, cuotaBytes: 1024 * 1024 * 1024 }}
        />,
      ),
    );
  });

  test("cuenta", async () => {
    await sinGraves(
      paginaApp(
        "Tu cuenta",
        <>
          <Perfil nombre="Ana" email="ana@ejemplo.test" verificado={false} />
          <Preferencias idioma="es" />
          <Credenciales
            bovedaLista
            credenciales={[
              {
                proveedor: "kie",
                pista: "…a1b2",
                estado: "valida",
                ultimoCodigo: null,
                ultimoDetalle: null,
                alta: "2026-09-01T10:00:00.000Z",
                ultimaPrueba: "2026-09-20T10:00:00.000Z",
                ultimaRotacion: null,
              },
            ]}
          />
          <Compatibles bovedaLista proveedores={[]} />
          <CambiarContrasena />
          <Passkeys passkeys={[{ id: "p1", nombre: "Portátil", creada: "2026-09-01T10:00:00.000Z" }]} />
          <Sesiones
            actual="s1"
            sesiones={[
              { id: "s1", agente: "Mozilla/5.0 (Macintosh)", ip: "127.0.0.1", creada: "2026-09-30T08:00:00.000Z" },
              { id: "s2", agente: "Mozilla/5.0 (iPhone)", ip: "10.0.0.2", creada: "2026-09-29T08:00:00.000Z" },
            ]}
          />
        </>,
      ),
    );
  });

  const proyecto: ProyectoVista = {
    id: "p1",
    titulo: "Champú de verano",
    formato: "anuncio",
    estado: "borrador",
    idea: "Una tarde de playa con el champú nuevo.",
    concepto: "",
    personajeId: null,
    personajeNombre: null,
    estiloVisual: "realista",
    presupuestoCreditos: 400,
    segundosClip: 8,
    formatos: ["vertical_9_16"],
    acento: "es_ES_madrid",
    totalEscenas: 3,
    totalEstimado: 240,
    creadoEn: "2026-09-29T10:00:00.000Z",
    actualizadoEn: "2026-09-30T10:00:00.000Z",
  };

  test("proyectos, vacía y con uno", async () => {
    const generables = Object.fromEntries(FORMATOS_MONTAJE.map((f) => [f, null])) as Record<
      FormatoMontaje,
      string | null
    >;
    for (const inicial of [[], [proyecto]]) {
      await sinGraves(
        paginaApp(
          "Tus proyectos",
          <ListaProyectos
            inicial={inicial}
            personajes={[]}
            presupuestoSugerido={500}
            formatosGenerables={generables}
          />,
        ),
      );
    }
  });

  test("lugares: lista vacía, lista con uno y su ficha con la declaración", async () => {
    const lugar = {
      id: "l1",
      nombre: "Bar de la esquina",
      descripcion: "Azulejos verdes y barra de zinc.",
      acabado: "realista" as const,
      estilo: "",
      fotos: 0,
      portada: null,
      tieneMaestra: false,
      declarado: false,
      version: 1,
      actualizado: "2026-09-30T00:00:00.000Z",
    };
    for (const inicial of [[], [lugar]]) await sinGraves(paginaApp("Tus lugares", <ListaLugares inicial={inicial} />));
    await sinGraves(
      renderToStaticMarkup(
        <div className="min-h-dvh bg-fondo">
          <CabeceraApp sesion={SESION} />
          <main id="contenido" tabIndex={-1}>
            <FichaLugar
              inicial={{
                ...lugar,
                referencias: [],
                declaracion: null,
                versiones: [{ numero: 1, cambios: ["alta"], creadaEn: lugar.actualizado }],
              }}
            />
          </main>
        </div>,
      ),
    );
  });

  test("admin: catálogo de componentes con la cabecera del panel", async () => {
    const html = renderToStaticMarkup(
      <div className="min-h-dvh">
        <CabeceraAdmin version="0.45.0" enRevision={2} />
        <Catalogo />
      </div>,
    );
    await sinGraves(html);
  }, 30_000);
});
