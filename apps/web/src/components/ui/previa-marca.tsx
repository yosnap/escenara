"use client";

import type { DocumentoMarca, ModoMarca } from "@/lib/marca-esquema";
import { estiloDeTema } from "@/lib/marca-previa";
import type { RolLogo } from "@/lib/marca-vista";
import { cssDeFuentes, type FuenteCss } from "@/lib/tokens";
import { Alerta } from "./alerta";
import { Boton } from "./button";
import { Campo, EntradaTexto } from "./field";
import { Logotipo } from "./logotipo";
import { ProveedorMarca } from "./marca-contexto";

/**
 * **Previsualización de una marca en los dos temas a la vez**, con componentes reales (botones, campo, alertas,
 * tarjeta, degradado y logotipo). Cada tema es un contenedor con las variables de la marca en su estilo: lo que se ve
 * es exactamente cómo se pintarían esos componentes con esa marca, sin tocar el resto de la página.
 *
 * Solo recibe documentos que han pasado el esquema; las fuentes propias se declaran con `@font-face` comprobado.
 */
export function PreviaMarca({
  documento,
  logos = {},
  fuentes = [],
}: {
  documento: DocumentoMarca;
  logos?: Partial<Record<RolLogo, string>>;
  fuentes?: FuenteCss[];
}) {
  const css = fuentes.length > 0 ? cssDeFuentes(documento, fuentes) : "";
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {css && (
        // biome-ignore lint/security/noDangerouslySetInnerHtml: @font-face con familias y URL comprobadas por exigirMarcaSegura
        <style dangerouslySetInnerHTML={{ __html: css }} />
      )}
      <PanelTema documento={documento} modo="light" logos={logos} />
      <PanelTema documento={documento} modo="dark" logos={logos} />
    </div>
  );
}

const NOMBRE_TEMA: Record<ModoMarca, string> = { light: "Tema claro", dark: "Tema oscuro" };

function PanelTema({
  documento,
  modo,
  logos,
}: {
  documento: DocumentoMarca;
  modo: ModoMarca;
  logos: Partial<Record<RolLogo, string>>;
}) {
  // En la previsualización cada panel es de un tema fijo: se le da solo su logotipo (o el del otro tema si falta).
  const propio = modo === "light" ? logos["horizontal-claro"] : logos["horizontal-oscuro"];
  const otro = modo === "light" ? logos["horizontal-oscuro"] : logos["horizontal-claro"];
  const logo = propio ?? otro;
  return (
    <section
      aria-label={`${NOMBRE_TEMA[modo]} con esta marca`}
      data-previa-tema={modo}
      style={estiloDeTema(documento, modo)}
      className="flex flex-col gap-4 rounded-tarjeta border border-borde p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <ProveedorMarca valor={{ nombre: documento.identity.name, logos: logo ? { "horizontal-claro": logo } : {} }}>
          <Logotipo />
        </ProveedorMarca>
        <span className="rounded-full bg-elevada px-3 py-1 text-xs font-semibold text-texto-suave">
          {NOMBRE_TEMA[modo]}
        </span>
      </div>
      <div className="h-2 rounded-full bg-degradado-escenario" aria-hidden />
      <div>
        <p className="text-2xl font-bold text-texto">{documento.identity.tagline.es}</p>
        <p className="text-texto-suave">{documento.identity.descriptor.es}</p>
      </div>
      <div className="flex flex-col gap-3 rounded-tarjeta border border-borde/60 bg-superficie p-4">
        <Campo etiqueta="Título de la escena" ayuda="Texto de ayuda en el tono suave.">
          {(props) => <EntradaTexto {...props} defaultValue="Presentación del producto" readOnly />}
        </Campo>
        <div className="flex flex-wrap gap-2">
          <Boton type="button">Crear escena</Boton>
          <Boton type="button" variante="secundario">
            Guardar
          </Boton>
          <span className="self-center font-semibold text-creativo">Creativo</span>
        </div>
      </div>
      <Alerta tipo="aviso" titulo="Aviso de ejemplo" anuncio="ninguno" compacta>
        Así se ve un aviso con esta marca.
      </Alerta>
      <Alerta tipo="hecho" titulo="Guardado" anuncio="ninguno" compacta>
        Y así una confirmación.
      </Alerta>
      <Alerta tipo="error" titulo="Error de ejemplo" anuncio="ninguno" compacta>
        Y un error, con su causa.
      </Alerta>
    </section>
  );
}
