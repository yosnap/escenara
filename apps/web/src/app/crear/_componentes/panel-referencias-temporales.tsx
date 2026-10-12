"use client";
import { Boton } from "@/components/ui/button";
import { Campo, EntradaTexto } from "@/components/ui/field";
import { MiniaturaMedio } from "@/components/ui/media/miniatura-medio";
import { SelectorMedios } from "@/components/ui/media/selector-medios";
import { Selector } from "@/components/ui/select";
import { MAXIMO_REFERENCIAS_TEMPORALES, USOS_REFERENCIA, type UsoReferencia } from "@/lib/referencias-temporales";
import type { ReferenciaEnPantalla } from "./referencias-en-pantalla";

export function PanelReferenciasTemporales({
  referencias,
  onCambio,
  deshabilitado,
  revision = false,
}: {
  referencias: readonly ReferenciaEnPantalla[];
  onCambio?: (referencias: ReferenciaEnPantalla[]) => void;
  deshabilitado?: boolean;
  revision?: boolean;
}) {
  if (revision && !referencias.length) return null;
  const cambiar = (id: string, cambio: Partial<ReferenciaEnPantalla>) =>
    onCambio?.(referencias.map((r) => (r.id === id ? { ...r, ...cambio } : r)));
  return (
    <section
      className="flex flex-col gap-4 rounded-tarjeta border border-borde bg-superficie p-4"
      data-requisito="referencias-temporales"
    >
      <h3 className="font-semibold text-texto">
        {revision ? "Referencias que se enviarán" : "Referencias para esta escena"}
      </h3>
      <p className="text-sm text-texto-suave">
        Estas imágenes sí se envían al modelo junto con las del personaje. No crean un lugar ni se añaden a su ficha.
        Escribe, por ejemplo: «Jorge en @terraza, con la ropa de @chaqueta». Cada imagen guía solo el aspecto que
        indiques; su cara viene del personaje.
      </p>
      {referencias.some((r) => r.uso === "lugar") && (
        <p className="text-sm text-texto-suave">
          El lugar se envía primero como fotografía base. Para personas reales se usan sus fotos originales, sin mezclar
          vistas generadas. El modelo debe conservar el lugar y la identidad; el resultado requiere revisión. Un formato
          distinto al de la foto puede recortar o ampliar el encuadre.
        </p>
      )}
      {referencias.map((r) =>
        revision ? (
          <div key={r.id} className="flex items-center gap-3">
            {r.medio && <MiniaturaMedio medio={r.medio} className="size-16 rounded-control object-cover" />}
            <span>
              @{r.etiqueta} · {USOS_REFERENCIA[r.uso]}
            </span>
          </div>
        ) : (
          <fieldset
            key={r.id}
            disabled={deshabilitado}
            className="flex flex-col gap-3 rounded-control border border-borde p-3"
          >
            <SelectorMedios
              etiqueta={`Imagen de @${r.etiqueta || "referencia"}`}
              tipos={["imagen"]}
              sinDocumentos
              valor={r.medio ? [r.medio] : []}
              onCambio={(medios) => cambiar(r.id, { medio: medios[0] ?? null })}
            />
            <Campo etiqueta="Etiqueta" ayuda="Sin arroba: terraza, chaqueta, pose…">
              {(props) => (
                <EntradaTexto
                  {...props}
                  value={r.etiqueta}
                  maxLength={30}
                  onChange={(e) => cambiar(r.id, { etiqueta: e.target.value })}
                />
              )}
            </Campo>
            <Selector
              etiqueta="Qué conservar de esta imagen"
              opciones={Object.entries(USOS_REFERENCIA).map(([value, label]) => ({ value, label }))}
              valor={r.uso}
              deshabilitado={deshabilitado}
              onCambio={(valor) => valor && cambiar(r.id, { uso: valor as UsoReferencia })}
            />
            <Boton variante="fantasma" tamano="sm" onClick={() => onCambio?.(referencias.filter((a) => a.id !== r.id))}>
              Quitar referencia
            </Boton>
          </fieldset>
        ),
      )}
      {!revision && referencias.length < MAXIMO_REFERENCIAS_TEMPORALES && (
        <Boton
          variante="secundario"
          disabled={deshabilitado}
          onClick={() =>
            onCambio?.([
              ...referencias,
              { id: crypto.randomUUID(), etiqueta: `referencia${referencias.length + 1}`, uso: "lugar", medio: null },
            ])
          }
        >
          Añadir referencia
        </Boton>
      )}
    </section>
  );
}
