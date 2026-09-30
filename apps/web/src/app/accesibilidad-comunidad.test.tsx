import { describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { auditar } from "@/lib/axe-de-prueba";
import type {
  CandidatoAPublicar,
  LogroVista,
  MiPublicacionVista,
  PublicacionEnModeracion,
  PublicacionVista,
  RetoVista,
} from "@/lib/comunidad";
import type { Sesion } from "@/server/auth/sesion";

/**
 * **axe sobre las pantallas de la comunidad** con datos de ejemplo, pintadas como las sirve el servidor (cabecera,
 * `main#contenido` y su `h1`): `/comunidad` (galería, retos, logros y tus publicaciones), `/comunidad/publicar` (normas,
 * formulario con la declaración y lista de lo que puedes publicar) y `/admin/moderacion` (cola, aprobar o rechazar y
 * retos). Ninguna puede tener violaciones serias o críticas.
 *
 * Límite: los diálogos (editar, retirar, rechazar, borrar un reto) se montan en un portal y solo en el navegador. Son el
 * `Dialogo` del catálogo con campos del catálogo, sin nada propio.
 */

const navegacion = await import("next/navigation");
mock.module("next/navigation", () => ({
  ...navegacion,
  useRouter: () => ({ refresh() {}, push() {}, replace() {} }),
  usePathname: () => "/comunidad",
  useSearchParams: () => new URLSearchParams(),
}));

const { CabeceraApp } = await import("./_app/cabecera-app");
const { CabeceraAdmin } = await import("./admin/cabecera-admin");
const { TarjetaPublicacion } = await import("@/components/ui/comunidad/tarjeta-publicacion");
const { AccionesPublicacion } = await import("@/components/ui/comunidad/acciones-publicacion");
const { BotonUsar } = await import("@/components/ui/comunidad/boton-usar");
const { ListaLogros } = await import("@/components/ui/comunidad/logros");
const { FormularioPublicar } = await import("@/components/ui/comunidad/formulario-publicar");
const { EnlacePublicar } = await import("@/components/ui/comunidad/enlace-publicar");
const { Moderar } = await import("@/components/ui/comunidad/moderar");
const { GestionRetos } = await import("@/components/ui/comunidad/formulario-reto");

const SESION = {
  user: { id: "u1", name: "Ana", email: "ana@ejemplo.test", role: "user", emailVerified: true },
  session: { id: "s1" },
} as unknown as Sesion;

const pagina = (cabecera: ReactNode, titulo: string, contenido: ReactNode) =>
  renderToStaticMarkup(
    <div className="min-h-dvh bg-fondo">
      {cabecera}
      <main id="contenido" tabIndex={-1}>
        <h1>{titulo}</h1>
        {contenido}
      </main>
    </div>,
  );

const sinGraves = async (html: string) => expect((await auditar(html)).graves).toEqual([]);

const PUBLICA: PublicacionVista = {
  id: "p1",
  tipo: "trend",
  titulo: "Unboxing con Lía",
  descripcion: "Mi personaje inventado abre una caja.",
  firma: "Ana crea",
  medios: [{ url: "/api/comunidad/publicaciones/p1/medios/0", tipo: "video", ancho: 720, alto: 1280, alt: "" }],
  plantilla: { id: "t1", nombre: "Unboxing" },
  reto: { id: "r1", titulo: "Reto de otoño" },
  publicadaEl: "2026-09-30T10:00:00.000Z",
  usos: 3,
};
const PERSONAJE: PublicacionVista = {
  ...PUBLICA,
  id: "p2",
  tipo: "personaje",
  titulo: "Lía",
  plantilla: null,
  medios: [
    { url: "/api/comunidad/publicaciones/p2/medios/0", tipo: "imagen", ancho: 512, alto: 512, alt: "Retrato de Lía" },
    { url: "/api/comunidad/publicaciones/p2/medios/1", tipo: "imagen", ancho: 512, alto: 512, alt: "" },
  ],
};
const MIA: MiPublicacionVista = {
  ...PUBLICA,
  id: "p3",
  estado: "rechazada",
  motivoRechazo: "Sale un logotipo real.",
  revision: 2,
  huerfana: false,
};
const EN_COLA: PublicacionEnModeracion = {
  ...MIA,
  estado: "pendiente",
  esDeQuienModera: false,
  elegibilidad: { publicable: true, motivos: [] },
};
const PROPIA: PublicacionEnModeracion = { ...EN_COLA, id: "p4", esDeQuienModera: true };
const LOGROS: LogroVista[] = [
  {
    clave: "primer_personaje",
    titulo: "Primer personaje",
    descripcion: "Has creado tu primer personaje.",
    pista: "Crea tu primer personaje.",
    conseguidoEl: "2026-09-01T10:00:00.000Z",
    porCelebrar: false,
  },
  {
    clave: "primera_exportacion",
    titulo: "Primera exportación",
    descripcion: "Has exportado tu primer vídeo.",
    pista: "Crea tu primer personaje.",
    conseguidoEl: null,
    porCelebrar: false,
  },
];
const RETO: RetoVista = {
  id: "r1",
  titulo: "Reto de otoño",
  descripcion: "Un clip con hojas.",
  desde: "2026-09-20T00:00:00.000Z",
  hasta: "2026-10-20T00:00:00.000Z",
  vigente: true,
  plantilla: { id: "t1", nombre: "Unboxing" },
  participaciones: 2,
};
const CANDIDATO: CandidatoAPublicar = {
  origen: { tipo: "medio", id: "m1" },
  nombre: "Clip de Lía",
  descripcionSugerida: "",
  miniatura: { url: "/api/media/m1/archivo", tipo: "video" },
  tipos: ["clip", "trend"],
  plantilla: { id: "t1", nombre: "Unboxing", tipo: "trend" },
  elegibilidad: { publicable: true, motivos: [] },
  publicacion: null,
};
const NO_PUBLICABLE: CandidatoAPublicar = {
  ...CANDIDATO,
  origen: { tipo: "personaje", id: "c1" },
  tipos: ["personaje"],
  elegibilidad: { publicable: false, motivos: ["Es un personaje hecho con fotos reales."] },
};

describe("accesibilidad de la comunidad (axe, sin violaciones graves)", () => {
  test("/comunidad: galería, retos, logros y tus publicaciones", async () => {
    await sinGraves(
      pagina(
        <CabeceraApp sesion={SESION} />,
        "Comunidad",
        <>
          <section aria-labelledby="g">
            <h2 id="g">Galería</h2>
            <TarjetaPublicacion publicacion={PUBLICA} pie={<BotonUsar id="p1" tipo="trend" />} />
            <TarjetaPublicacion publicacion={PERSONAJE} />
          </section>
          <section aria-labelledby="l">
            <h2 id="l">Tus logros</h2>
            <ListaLogros logros={LOGROS} />
          </section>
          <section aria-labelledby="m">
            <h2 id="m">Tus publicaciones</h2>
            <TarjetaPublicacion publicacion={MIA} estado="rechazada" pie={<AccionesPublicacion publicacion={MIA} />} />
          </section>
        </>,
      ),
    );
  });

  test("/comunidad/publicar: formulario con declaración y candidatos con su motivo", async () => {
    await sinGraves(
      pagina(
        <CabeceraApp sesion={SESION} />,
        "Publicar en la comunidad",
        <>
          <FormularioPublicar
            candidato={CANDIDATO}
            retos={[{ id: "r1", titulo: "Reto de otoño" }]}
            firmaSugerida="Ana"
          />
          <EnlacePublicar candidato={CANDIDATO} />
          <EnlacePublicar candidato={NO_PUBLICABLE} />
        </>,
      ),
    );
  });

  test("/admin/moderacion: cola con aprobar y rechazar, y retos", async () => {
    await sinGraves(
      pagina(
        <CabeceraAdmin version="0.49.0" />,
        "Moderación",
        <>
          <TarjetaPublicacion publicacion={EN_COLA} estado="pendiente" pie={<Moderar publicacion={EN_COLA} />} />
          <TarjetaPublicacion publicacion={PROPIA} estado="pendiente" pie={<Moderar publicacion={PROPIA} />} />
          <GestionRetos retos={[RETO]} plantillas={[{ id: "t1", nombre: "Unboxing" }]} />
        </>,
      ),
    );
  });

  test("la declaración expresa está en el formulario y el envío dice que pasa por moderación", () => {
    const html = renderToStaticMarkup(<FormularioPublicar candidato={CANDIDATO} retos={[]} firmaSugerida="Ana" />);
    expect(html).toContain("Confirmo que es contenido sintético");
    expect(html).toContain("Nadie más lo verá hasta que lo apruebe quien modera");
    expect(html).not.toContain("<select");
  });

  test("lo propio no se aprueba: el botón está deshabilitado y explica por qué", () => {
    const html = renderToStaticMarkup(<Moderar publicacion={{ ...EN_COLA, esDeQuienModera: true }} />);
    expect(html).toContain("Es tuya");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*Aprobar/s);
  });
});
