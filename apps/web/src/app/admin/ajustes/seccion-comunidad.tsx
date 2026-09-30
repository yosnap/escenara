"use client";

import { Users } from "lucide-react";
import { Interruptor } from "@/components/ui/choice";
import { AreaTexto, Campo, EntradaTexto } from "@/components/ui/field";
import type { Ajustes } from "@/server/ajustes";
import { Seccion } from "./seccion-ajustes";

/**
 * **Comunidad**: apagada de fábrica. Encendida, las cuentas pueden publicar contenido sintético (personajes inventados y
 * lo que hagan con ellos) y, tras la moderación en Admin › Moderación, verlo en la galería. Las normas se enseñan al
 * publicar.
 */
export function SeccionComunidad({
  valores,
  errorDe,
  onCambio,
}: {
  valores: Ajustes;
  errorDe: (campo: keyof Ajustes) => string | undefined;
  onCambio: <K extends keyof Ajustes>(clave: K, valor: Ajustes[K]) => void;
}) {
  return (
    <Seccion
      titulo="Comunidad"
      descripcion="Galería de contenido sintético con moderación previa, retos y logros. Nada se ve sin aprobación en Admin › Moderación."
      icono={<Users />}
    >
      <Interruptor
        etiqueta="Encender la comunidad"
        descripcion="Apagada de fábrica. Apagada, nadie publica ni ve la galería; lo publicado se conserva oculto y los autores pueden retirarlo. Los logros funcionan igual."
        activo={valores.comunidadActiva}
        onCambio={(v) => onCambio("comunidadActiva", v)}
      />
      <Campo
        etiqueta="Normas de publicación (una por línea)"
        ayuda="Se enseñan antes de publicar. Solo contenido sintético es una regla del sistema: no depende de este texto."
        error={errorDe("comunidadNormas")}
      >
        {(p) => (
          <AreaTexto
            {...p}
            rows={6}
            value={valores.comunidadNormas}
            onChange={(e) => onCambio("comunidadNormas", e.target.value)}
          />
        )}
      </Campo>
      <Campo
        etiqueta="Publicaciones pendientes por cuenta"
        ayuda="De 1 a 50. Con este número esperando moderación, esa cuenta no puede enviar otra."
        error={errorDe("comunidadMaximoPendientes")}
      >
        {(p) => (
          <EntradaTexto
            {...p}
            type="number"
            min={1}
            max={50}
            value={valores.comunidadMaximoPendientes}
            onChange={(e) => onCambio("comunidadMaximoPendientes", Number(e.target.value))}
          />
        )}
      </Campo>
    </Seccion>
  );
}
