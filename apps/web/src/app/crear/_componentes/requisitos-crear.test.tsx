import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { evaluacionPendiente } from "@/lib/controles";
import { DIRECCION_CON_ACENTO_VACIA } from "@/lib/direccion";
import type { Estimacion } from "@/lib/generacion";
import type { Medio } from "@/lib/media/tipos";
import type { CatalogoParaCrear, PlantillaVisible } from "@/lib/presets";
import { PRODUCTO_ELEGIDO_VACIO } from "@/lib/productos";
import type { Requisito } from "@/lib/requisitos";
import { requisitosDelClip, requisitosDelFotograma } from "@/lib/requisitos-crear";
import { ESTADO_PLANTILLA_VACIO, previsualizar } from "./panel-plantilla";
import { PasoClip } from "./paso-clip";
import { PasoEscena } from "./paso-escena";
import { PasoSujeto } from "./paso-sujeto";
import type { Controles } from "./use-controles";

/**
 * Regresión: con una imagen tuya y un trend elegido, la confirmación decía «Falta «Qué ocurre en la escena»» y no había
 * ningún campo donde escribirlo. Ahora la variable de texto se escribe en el paso del clip, es el mismo dato que la
 * descripción y, donde sí hay paso «Describe la escena», no se duplica.
 */
const TREND: PlantillaVisible = {
  id: "unboxing",
  nombre: "Unboxing en primera persona",
  descripcion: "Abres la caja",
  kind: "trend",
  targetSeconds: 6,
  trendAllowsSpeech: false,
  capacidad: "image_to_video",
  variables: [{ nombre: "escena", tipo: "texto", etiqueta: "Qué ocurre en la escena", obligatoria: true }],
  version: 1,
  versionId: "v1",
  deLaInstalacion: true,
};
const CATALOGO = { presets: [], incompatibles: {}, plantillas: [TREND] } as unknown as CatalogoParaCrear;
const ESTADO = { ...ESTADO_PLANTILLA_VACIO, plantillaId: TREND.id };

const ESTIMACION = {
  tipo: "animacion",
  modelo: "veo",
  nombreModelo: "Veo",
  conVoz: false,
  unidad: "clip de 6 s",
  creditos: 30,
  euros: 0.15,
  saldo: null,
  alcanza: true,
  superaUmbral: false,
  umbral: 500,
  fuente: "test",
  comprobado: "2026-09-30",
  precioAntiguo: false,
  sello: "s",
  traduccion: null,
  segundos: 6,
  duraciones: [],
  sinReferencia: false,
} as unknown as Estimacion;

const CONTROLES: Controles = {
  evaluacion: evaluacionPendiente("v"),
  confirmados: [],
  cargando: false,
  bloqueos: [],
  firma: "",
  refrescar: async () => null,
  confirmar: () => {},
};
const CASILLAS = {
  derechos: false,
  derechoMarca: false,
  avisoAceptado: false,
  setDerechos: () => {},
  setDerechoMarca: () => {},
  setAvisoAceptado: () => {},
};
const IMAGEN = { id: "m1", tipo: "imagen", nombre: "foto.png", url: "/m/1" } as unknown as Medio;

/** El paso del clip tal como lo compone `vista-crear.tsx` con una imagen tuya (`imagen`) o con fotograma. */
function pintarClip(descripcion: string, origen: "imagen" | "fotograma") {
  const previa = previsualizar(CATALOGO, ESTADO, descripcion.trim(), null);
  const base = requisitosDelClip({
    sinPasoDeEscena: origen === "imagen",
    motivosPlantilla: previa.detalle,
    exigeRevision: false,
    sinTerceros: true,
  });
  return renderToStaticMarkup(
    <PasoClip
      numero={4}
      origen={IMAGEN}
      modelos={[]}
      estimacion={ESTIMACION}
      conVoz={false}
      segundos={6}
      dialogo=""
      opcionesDireccion={null}
      direccion={DIRECCION_CON_ACENTO_VACIA}
      producto={PRODUCTO_ELEGIDO_VACIO}
      onProducto={() => {}}
      catalogo={CATALOGO}
      plantilla={ESTADO}
      previa={previa}
      requisitosBase={base}
      requisitos={base}
      avisoModelo={null}
      segundosDelTrend={6}
      descripcion={descripcion}
      conCampoDeTexto={origen === "imagen"}
      confirmacion={CASILLAS}
      controles={CONTROLES}
      exigeRevision={false}
      sinTerceros
      enviando={false}
      firma="f"
      clipEnMarcha={null}
      clipsAnteriores={[]}
      accionesDePreset={() => null}
      onModelo={() => {}}
      onDuracion={() => {}}
      onDialogo={() => {}}
      onDescripcion={() => {}}
      onIrARequisito={() => {}}
      onDireccion={() => {}}
      onPlantilla={() => {}}
      onDuplicar={() => {}}
      onSinTerceros={() => {}}
      onGenerar={() => {}}
      onCambioClip={() => {}}
      onOtroClip={() => {}}
    />,
  );
}

const cuantas = (html: string, marca: string) => html.split(marca).length - 1;

describe("la variable de texto del trend con una imagen tuya", () => {
  test("hay un campo con la etiqueta de la variable, marcado como pendiente, y el aviso de arriba lleva a él", () => {
    const html = pintarClip("", "imagen");
    expect(html).toContain("Qué ocurre en la escena");
    expect(html).toContain('data-requisito="descripcion"');
    expect(html).toContain("<textarea");
    // El mensaje bajo el campo y el punto del aviso de arriba dicen lo mismo que la confirmación.
    expect(cuantas(html, "Falta «Qué ocurre en la escena».")).toBeGreaterThanOrEqual(3);
    expect(html).toContain("Antes de generar, falta:");
    expect(html).toContain('aria-invalid="true"');
  });

  test("escrito el texto, el campo lo muestra y deja de faltar", () => {
    const html = pintarClip("Abro la caja y aparece el producto", "imagen");
    expect(html).toContain("Abro la caja y aparece el producto");
    expect(html).not.toContain("Falta «Qué ocurre en la escena»");
    expect(html).not.toContain("Antes de generar, falta:");
  });

  test("con paso de escena no se duplica el campo ni su marca", () => {
    const html = pintarClip("", "fotograma");
    expect(cuantas(html, 'data-requisito="descripcion"')).toBe(0);
    expect(html).not.toContain("Qué ocurre en la escena</label>");
  });

  test("el campo del paso de escena lleva la misma marca y el mismo texto pendiente", () => {
    const previa = previsualizar(CATALOGO, ESTADO, "", null);
    const requisitos = requisitosDelFotograma({
      sinImagen: true,
      hayModeloSinImagen: true,
      haySujeto: false,
      sinTerceros: false,
      modeloSinReferencias: false,
      caracteresDescripcion: 0,
      motivosPlantilla: previa.detalle,
    });
    const html = renderToStaticMarkup(
      <PasoEscena
        numero={4}
        prompt=""
        dialogo=""
        conVoz={false}
        catalogo={CATALOGO}
        plantilla={ESTADO}
        previa={previa}
        requisitos={requisitos}
        deshabilitado={false}
        accionesDePreset={() => null}
        onPrompt={() => {}}
        onDialogo={() => {}}
        onPlantilla={() => {}}
        onDuplicar={() => {}}
      />,
    );
    expect(cuantas(html, 'data-requisito="descripcion"')).toBe(1);
    expect(html).toContain("Falta describir la escena.");
    expect(html).toContain('aria-invalid="true"');
  });
});

describe("las casillas de derechos y de revisión salen marcadas", () => {
  test("la revisión de las fotos del paso «A quién generas» apunta a su casilla", () => {
    const pendiente: Requisito[] = requisitosDelFotograma({
      sinImagen: false,
      hayModeloSinImagen: true,
      haySujeto: true,
      sinTerceros: false,
      modeloSinReferencias: false,
      caracteresDescripcion: 40,
      motivosPlantilla: [],
    });
    const html = renderToStaticMarkup(
      <PasoSujeto
        numero={3}
        personajes={[]}
        personajeId={null}
        personaje={null}
        imagen={[IMAGEN]}
        referencia={IMAGEN}
        modelos={[]}
        sinImagen={false}
        modeloElegido="nano"
        modeloFoto={null}
        sinTerceros={false}
        requisitos={pendiente}
        deshabilitado={false}
        onPersonaje={() => {}}
        onImagen={() => {}}
        onSinTerceros={() => {}}
        onModelo={() => {}}
      />,
    );
    expect(html).toContain('data-requisito="fotograma-revision"');
    expect(html).toContain("Falta confirmar la revisión de las fotos.");
  });

  test("las casillas de la confirmación del clip llevan su marca y su mensaje", () => {
    const html = pintarClip("Abro la caja y aparece el producto", "imagen");
    expect(html).toContain('data-requisito="clip-derechos"');
    expect(html).toContain("Falta confirmar que tienes derecho a usar la imagen.");
  });
});
