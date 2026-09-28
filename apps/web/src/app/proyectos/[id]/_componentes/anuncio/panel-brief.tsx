"use client";

import { Megaphone } from "lucide-react";
import { useState } from "react";
import { PanelAnguloFiel, ResumenDeOferta, SelectorDeAngulo, ZonaDeDeclaracion } from "@/components/ui/anuncio";
import { Boton } from "@/components/ui/button";
import { Aviso } from "@/components/ui/feedback";
import { AreaTexto, Campo, EntradaTexto } from "@/components/ui/field";
import { Paso } from "@/components/ui/paso";
import { Selector } from "@/components/ui/select";
import {
  AVISO_DECLARACION_NECESARIA,
  AYUDA_PUBLICO,
  AYUDA_VERSION_MEJOR,
  NOTAS_BRIEF_MAXIMAS,
  PROYECTO_SIN_BRIEF,
  PUBLICO_MAXIMO,
  VERSION_MEJOR_MAXIMA,
} from "@/lib/anuncio";
import { faltaDeclaracion } from "@/lib/anuncio-pantalla";
import type { CorreccionHumana } from "@/lib/coherencia";
import { ESCENAS_SUGERIDAS, type ProyectoDetalle } from "@/lib/proyectos";
import type { DatosDelAnuncio } from "@/server/anuncio/pantalla";
import {
  comprobarAngulo,
  corregirAngulo,
  declararVeracidad,
  guardarBrief,
  type VeredictoDelAngulo,
} from "./api-anuncio";
import { EditorDeOferta } from "./editor-oferta";
import { PanelDeHooks } from "./panel-hooks";
import { PanelDeVariantes } from "./panel-variantes";

/**
 * **El brief del anuncio**, el primer paso de un proyecto (0.27.0): producto, público, la versión mejor de sí
 * mismo, **un** ángulo de los del catálogo y la oferta.
 *
 * Es **opcional** a propósito. Un proyecto sin brief sigue funcionando exactamente como antes de esta versión: se
 * escribe la idea, se pide guion al asistente de siempre y se produce. Lo que este paso añade es que el guion deje
 * de nacer de la nada, no un formulario que haya que rellenar para poder trabajar.
 *
 * Y si quien administra apaga el brief, aquí se explica en una frase en lugar de desaparecer sin más: lo que ya
 * estaba escrito no se borra ni se esconde.
 */
export function PanelBrief({
  proyecto,
  datos,
  onError,
  onRecargar,
}: {
  proyecto: ProyectoDetalle["proyecto"];
  datos: DatosDelAnuncio;
  onError: (mensaje: string) => void;
  /**
   * Lo que se ha escrito en el proyecto (escenas del guion, hook aplicado) ya no es lo que hay en pantalla: quien
   * lo use vuelve a leer el proyecto del servidor. Se recibe como función en lugar de llamar al router aquí para
   * que este panel se pueda renderizar y probar sin montar la navegación entera.
   */
  onRecargar: () => void;
}) {
  const [brief, setBrief] = useState(datos.brief);
  const [puerta, setPuerta] = useState(datos.puerta);
  const [ofertas, setOfertas] = useState(datos.ofertas);
  const [publico, setPublico] = useState(datos.brief?.publico ?? "");
  const [versionMejor, setVersionMejor] = useState(datos.brief?.versionMejor ?? "");
  const [notas, setNotas] = useState(datos.brief?.notas ?? "");
  const [guardando, setGuardando] = useState(false);
  const [hecho, setHecho] = useState<string | null>(null);
  const [declarando, setDeclarando] = useState(false);
  const [veredicto, setVeredicto] = useState<VeredictoDelAngulo>({ decision: datos.anguloFiel, motivo: "" });
  const [comprobando, setComprobando] = useState(false);

  /** Guarda solo lo que se le pasa. Lo que no viaja se queda como estaba, así que se puede guardar a trozos. */
  const guardar = async (cambios: Record<string, unknown>, mensaje = "Guardado.") => {
    setGuardando(true);
    setHecho(null);
    const resultado = await guardarBrief(proyecto.id, cambios);
    setGuardando(false);
    if (!resultado.ok) {
      onError(resultado.error);
      return;
    }
    setBrief(resultado.datos.brief);
    setPuerta(resultado.datos.puerta);
    setHecho(mensaje);
  };

  const declarar = async () => {
    if (brief === null || brief.anguloVista === null) return;
    setDeclarando(true);
    const resultado = await declararVeracidad(proyecto.id, brief.anguloVista.clave);
    setDeclarando(false);
    if (!resultado.ok) {
      onError(resultado.error);
      return;
    }
    setBrief({ ...brief, declaracionRegistrada: true });
    setPuerta(resultado.datos.puerta);
    setHecho("Declaración registrada.");
  };

  const comprobar = async () => {
    setComprobando(true);
    const resultado = await comprobarAngulo(proyecto.id);
    setComprobando(false);
    if (!resultado.ok) {
      onError(resultado.error);
      return;
    }
    setVeredicto(resultado.datos);
  };

  const corregir = async (decisionId: string, correccion: CorreccionHumana) => {
    setComprobando(true);
    const resultado = await corregirAngulo(proyecto.id, decisionId, correccion);
    setComprobando(false);
    if (!resultado.ok) {
      onError(resultado.error);
      return;
    }
    setVeredicto(resultado.datos);
  };

  if (!datos.activo) {
    return (
      <Paso numero={1} titulo="El brief del anuncio">
        <Aviso tono="info">
          El brief del anuncio está apagado en esta instalación, así que el guion se escribe como hasta ahora: con la
          idea y el asistente. Quien la administra puede encenderlo en Admin › Ajustes › Estrategia del anuncio. Lo que
          ya hubieras escrito sigue guardado.
        </Aviso>
      </Paso>
    );
  }

  if (brief === null) {
    return (
      <Paso numero={1} titulo="El brief del anuncio">
        <div className="flex flex-col gap-3">
          <p className="text-texto-suave">{PROYECTO_SIN_BRIEF}</p>
          <p className="text-texto-suave">
            Un anuncio son tres palancas: el <strong className="text-texto">ángulo</strong> (a quién le hablas y desde
            qué dolor o deseo, el 80 % del resultado), la <strong className="text-texto">oferta</strong> (qué le das) y
            la <strong className="text-texto">creatividad</strong>, que amplifica las dos anteriores pero no salva un
            anuncio con mal ángulo.
          </p>
          <div>
            <Boton
              variante="secundario"
              cargando={guardando}
              icono={<Megaphone className="size-5" />}
              onClick={() => guardar({}, "Brief creado: elige el producto y el ángulo.")}
            >
              Escribir el brief de este anuncio
            </Boton>
          </div>
        </div>
      </Paso>
    );
  }

  const productoId = brief.productoId ?? "";
  /** `true` cuando el ángulo la exige y todavía no hay ninguna registrada: es lo que decide si se pide la casilla. */
  const pideDeclaracion = faltaDeclaracion(brief);

  return (
    <Paso numero={1} titulo="El brief del anuncio">
      <div className="flex flex-col gap-5">
        {hecho && <Aviso tono="correcto">{hecho}</Aviso>}

        <Selector
          etiqueta="De qué producto es el anuncio"
          marcador={datos.productos.length === 0 ? "Todavía no tienes productos" : "Elige el producto"}
          deshabilitado={guardando || datos.productos.length === 0}
          valor={productoId}
          opciones={datos.productos.map((p) => ({ value: p.id, label: p.nombre }))}
          onCambio={(v) => {
            if (v === null || v === productoId) return;
            void guardar({ productoId: v });
          }}
        />
        {datos.productos.length === 0 && (
          <p className="text-sm text-texto-suave">
            El anuncio es de algo: crea antes su ficha en «Productos», con su nombre, su descripción y sus fotos.
          </p>
        )}

        <Campo etiqueta="A quién le habla" ayuda={AYUDA_PUBLICO}>
          {(p) => (
            <EntradaTexto
              {...p}
              value={publico}
              maxLength={PUBLICO_MAXIMO}
              onChange={(e) => setPublico(e.target.value)}
            />
          )}
        </Campo>

        <Campo etiqueta="La versión mejor de sí mismo que compra" ayuda={AYUDA_VERSION_MEJOR}>
          {(p) => (
            <EntradaTexto
              {...p}
              value={versionMejor}
              maxLength={VERSION_MEJOR_MAXIMA}
              onChange={(e) => setVersionMejor(e.target.value)}
            />
          )}
        </Campo>

        <div className="flex flex-col gap-2">
          <div>
            <h3 className="text-base font-bold text-texto">El ángulo, uno solo</h3>
            <p className="text-sm text-texto-suave">
              Por dónde entra el anuncio. Es el <strong className="text-texto">80 % del resultado</strong>, y mezclar
              varios es el error más común: aquí se elige <strong className="text-texto">uno</strong>. Si quieres probar
              otro, se crea un anuncio hermano más abajo.
            </p>
          </div>
          <SelectorDeAngulo
            angulos={datos.angulos}
            elegido={brief.angulo}
            deshabilitado={guardando}
            onElegir={(clave) => {
              if (clave === brief.angulo) return;
              void guardar({ angulo: clave });
            }}
          />
        </div>

        {brief.anguloVista !== null && brief.anguloVista.exigeDeclaracion && (
          <ZonaDeDeclaracion
            nombreAngulo={brief.anguloVista.nombre}
            aviso={AVISO_DECLARACION_NECESARIA}
            registrada={!pideDeclaracion}
            aceptada={false}
            deshabilitado={declarando}
            onAceptar={(valor) => {
              if (valor) void declarar();
            }}
          />
        )}

        <div className="flex flex-col gap-3">
          <h3 className="text-base font-bold text-texto">La oferta</h3>
          <EditorDeOferta
            ofertas={ofertas}
            productos={datos.productos}
            productoId={productoId}
            ofertaId={brief.ofertaId}
            deshabilitado={guardando}
            onElegir={(id) => void guardar({ ofertaId: id ?? "" })}
            onOfertas={(lista) => {
              setOfertas(lista);
              // La oferta atada puede haber cambiado de contenido: se relee el brief para enseñarla como quedó.
              onRecargar();
            }}
            onError={onError}
          />
          <ResumenDeOferta oferta={brief.oferta} />
        </div>

        <Campo etiqueta="Notas" ayuda="Lo que el asistente debería tener en cuenta y no cabe arriba. No hace falta.">
          {(p) => (
            <AreaTexto
              {...p}
              rows={3}
              value={notas}
              maxLength={NOTAS_BRIEF_MAXIMAS}
              onChange={(e) => setNotas(e.target.value)}
            />
          )}
        </Campo>

        <div className="flex flex-wrap gap-3">
          <Boton
            variante="secundario"
            cargando={guardando}
            onClick={() => void guardar({ publico, versionMejor, notas })}
          >
            Guardar el brief
          </Boton>
        </div>

        {/*
          Lo que falta para pedir guion lo dice **una sola vez**, dentro del panel que lo pide: el motivo de la
          puerta ya nombra lo que falta —incluida la declaración— y repetirlo aquí era el mismo párrafo dos veces
          seguidas en la pantalla.
        */}
        <PanelDeHooks
          proyectoId={proyecto.id}
          estimacion={datos.estimacion}
          puerta={puerta}
          hooksPedidos={datos.hooksPedidos}
          escenas={ESCENAS_SUGERIDAS[proyecto.formato]}
          deshabilitado={guardando}
          onError={onError}
          onCambio={onRecargar}
        />

        {datos.variantesActivas ? (
          <div className="flex flex-col gap-3">
            <h3 className="text-base font-bold text-texto">Un anuncio por ángulo</h3>
            <PanelDeVariantes
              proyectoId={proyecto.id}
              titulo={proyecto.titulo}
              deshabilitado={guardando}
              onError={onError}
            />
          </div>
        ) : (
          <p className="text-sm text-texto-suave">
            Las variantes por ángulo están apagadas en esta instalación. Quien la administra puede encenderlas en Admin
            › Ajustes › Estrategia del anuncio.
          </p>
        )}

        <PanelAnguloFiel
          decision={veredicto.decision}
          motivo={veredicto.motivo}
          enSombra={datos.modoAnguloFiel === "sombra"}
          ocupado={comprobando}
          onComprobar={() => void comprobar()}
          onCorregir={(id, correccion) => void corregir(id, correccion)}
        />
      </div>
    </Paso>
  );
}
