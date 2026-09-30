"use client";

import { AccionesPublicacion } from "@/components/ui/comunidad/acciones-publicacion";
import { BotonUsar } from "@/components/ui/comunidad/boton-usar";
import { EnlacePublicar } from "@/components/ui/comunidad/enlace-publicar";
import { FormularioPublicar } from "@/components/ui/comunidad/formulario-publicar";
import { GestionRetos } from "@/components/ui/comunidad/formulario-reto";
import { ListaLogros } from "@/components/ui/comunidad/logros";
import { Moderar } from "@/components/ui/comunidad/moderar";
import { EtiquetaEstado, TarjetaPublicacion } from "@/components/ui/comunidad/tarjeta-publicacion";
import type {
  CandidatoAPublicar,
  MiPublicacionVista,
  PublicacionEnModeracion,
  PublicacionVista,
} from "@/lib/comunidad";
import { Muestra, Seccion } from "../seccion";

/**
 * **Comunidad**: tarjeta de publicación (pública, del autor y en moderación), estados, publicar con la declaración,
 * elegibilidad junto a un original, logros y retos. Datos de ejemplo sin archivos: aquí no hay publicaciones de nadie,
 * y los botones que llamarían al servidor no cambian nada.
 */

const PUBLICA: PublicacionVista = {
  id: "ejemplo-1",
  tipo: "trend",
  titulo: "Unboxing con Lía",
  descripcion: "Mi personaje inventado abre una caja de galletas.",
  firma: "Ana crea",
  medios: [],
  plantilla: { id: "t", nombre: "Unboxing" },
  reto: { id: "r", titulo: "Reto de otoño" },
  publicadaEl: "2026-09-30T10:00:00.000Z",
  usos: 3,
};
const MIA: MiPublicacionVista = {
  ...PUBLICA,
  id: "ejemplo-2",
  tipo: "clip",
  plantilla: null,
  estado: "rechazada",
  motivoRechazo: "Sale un logotipo real en la camiseta.",
  revision: 2,
  huerfana: false,
  oculta: null,
};
const EN_COLA: PublicacionEnModeracion = {
  ...MIA,
  id: "ejemplo-3",
  estado: "pendiente",
  esDeQuienModera: false,
  elegibilidad: { publicable: true, motivos: [] },
  procedencia: [
    { paso: 0, descripcion: "Lo publicado: generado con «Lía» (inventado)", seguro: true },
    { paso: 1, descripcion: "Imagen enviada (paso 1): generado con «Lía» (inventado)", seguro: true },
  ],
};
const CANDIDATO: CandidatoAPublicar = {
  origen: { tipo: "medio", id: "m" },
  nombre: "Clip de Lía",
  descripcionSugerida: "",
  miniatura: null,
  tipos: ["clip", "trend"],
  plantilla: { id: "t", nombre: "Unboxing", tipo: "trend" },
  elegibilidad: { publicable: true, motivos: [] },
  publicacion: null,
};

export function SeccionComunidad() {
  return (
    <Seccion
      id="comunidad"
      titulo="Comunidad"
      descripcion="Solo contenido sintético, publicado elemento a elemento por su autor y visible tras moderación. Sin comentarios, seguidores ni mensajes."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Muestra titulo="Tarjeta en la galería (con «Usar»)">
          <TarjetaPublicacion publicacion={PUBLICA} pie={<BotonUsar id={PUBLICA.id} tipo="trend" />} />
        </Muestra>
        <Muestra titulo="Tu publicación rechazada, con su motivo">
          <TarjetaPublicacion publicacion={MIA} estado="rechazada" pie={<AccionesPublicacion publicacion={MIA} />} />
        </Muestra>
        <Muestra titulo="Estados">
          <EtiquetaEstado estado="pendiente" />
          <EtiquetaEstado estado="aprobada" />
          <EtiquetaEstado estado="rechazada" />
        </Muestra>
        <Muestra titulo="Elegibilidad junto al original">
          <EnlacePublicar candidato={CANDIDATO} />
          <EnlacePublicar
            candidato={{
              ...CANDIDATO,
              elegibilidad: { publicable: false, motivos: ["Es un personaje hecho con fotos reales."] },
            }}
          />
        </Muestra>
        <Muestra titulo="Publicar (declaración expresa)">
          <FormularioPublicar
            candidato={CANDIDATO}
            retos={[{ id: "r", titulo: "Reto de otoño" }]}
            firmaSugerida="Ana"
          />
        </Muestra>
        <Muestra titulo="Moderar (aprobar o rechazar con motivo)">
          <TarjetaPublicacion publicacion={EN_COLA} estado="pendiente" pie={<Moderar publicacion={EN_COLA} />} />
        </Muestra>
        <Muestra titulo="Logros por hitos reales">
          <ListaLogros
            logros={[
              {
                clave: "primer_personaje",
                titulo: "Primer personaje",
                descripcion: "Has creado tu primer personaje.",
                pista: "Crea tu primer personaje.",
                conseguidoEl: "2026-09-01T10:00:00.000Z",
                porCelebrar: false,
              },
              {
                clave: "primera_publicacion_aprobada",
                titulo: "Primera publicación aprobada",
                descripcion: "La comunidad ya ve algo tuyo.",
                pista: "Crea tu primer personaje.",
                conseguidoEl: null,
                porCelebrar: false,
              },
            ]}
          />
        </Muestra>
        <Muestra titulo="Retos (quien administra)">
          <GestionRetos
            retos={[
              {
                id: "r",
                titulo: "Reto de otoño",
                descripcion: "",
                desde: "2026-09-20T00:00:00.000Z",
                hasta: "2026-10-20T00:00:00.000Z",
                vigente: true,
                plantilla: { id: "t", nombre: "Unboxing" },
                participaciones: 2,
              },
            ]}
            plantillas={[{ id: "t", nombre: "Unboxing" }]}
          />
        </Muestra>
      </div>
    </Seccion>
  );
}
