import { describe, expect, test } from "bun:test";
import type { MotivoDePlantilla } from "./plantillas-prompt";
import {
  errorDeRequisito,
  ID_DESCRIPCION,
  pendientesPorPaso,
  type Requisito,
  requisitosDeConfirmacion,
  requisitosDeControles,
  requisitosDePlantilla,
} from "./requisitos";
import {
  type DatosDelClip,
  type DatosDelFotograma,
  ID_MODELO_FOTOGRAMA,
  ID_REVISION_CLIP,
  ID_REVISION_FOTOGRAMA,
  ID_SUJETO,
  requisitosDeCrear,
  requisitosDelClip,
  requisitosDelFotograma,
  variableDeTexto,
} from "./requisitos-crear";

const ESCENA: MotivoDePlantilla = { texto: "Falta «Qué ocurre en la escena».", deTexto: true };
const PLANO: MotivoDePlantilla = { texto: "Falta «Plano».", deTexto: false };

const FOTOGRAMA_LISTO: DatosDelFotograma = {
  sinImagen: false,
  hayModeloSinImagen: true,
  haySujeto: true,
  sinTerceros: true,
  modeloSinReferencias: false,
  caracteresDescripcion: 40,
  motivosPlantilla: [],
};
const CLIP_LISTO: DatosDelClip = {
  sinPasoDeEscena: false,
  motivosPlantilla: [],
  exigeRevision: false,
  sinTerceros: true,
  etiquetaDeTexto: null,
  caracteresDescripcion: 0,
};

describe("requisitos de la confirmación", () => {
  const base = {
    envio: "clip",
    paso: "clip",
    conProducto: true,
    superaUmbral: true,
    derechos: false,
    derechoMarca: false,
    avisoAceptado: false,
  };

  test("los mismos textos y el mismo orden de siempre, cada uno apuntando a su casilla", () => {
    expect(requisitosDeConfirmacion(base)).toEqual([
      { id: "clip-derechos", paso: "clip", texto: "Falta confirmar que tienes derecho a usar la imagen." },
      { id: "clip-marca", paso: "clip", texto: "Falta confirmar que tienes derecho a usar la marca del producto." },
      { id: "clip-aviso-gasto", paso: "clip", texto: "Falta aceptar el aviso de gasto." },
    ]);
  });

  test("la marca solo se pide con producto y el aviso solo si se supera el umbral", () => {
    const textos = requisitosDeConfirmacion({ ...base, conProducto: false, superaUmbral: false }).map((r) => r.id);
    expect(textos).toEqual(["clip-derechos"]);
  });

  test("marcadas las casillas no falta nada", () => {
    expect(requisitosDeConfirmacion({ ...base, derechos: true, derechoMarca: true, avisoAceptado: true })).toEqual([]);
  });

  test("los frenos de los controles apuntan al panel «Antes de generar» de su envío", () => {
    expect(requisitosDeControles(["Falta X."], "fotograma", "coste")).toEqual([
      { id: "fotograma-controles", paso: "coste", texto: "Falta X." },
    ]);
  });
});

describe("requisitos de la plantilla", () => {
  const destino = { envio: "clip", paso: "clip", pasoDelTexto: "escena" };

  test("una variable de texto apunta al campo de la escena y el resto a la botonera del envío", () => {
    expect(requisitosDePlantilla([ESCENA, PLANO], destino)).toEqual([
      { id: ID_DESCRIPCION, paso: "escena", texto: ESCENA.texto },
      { id: "clip-plantilla", paso: "clip", texto: PLANO.texto },
    ]);
  });
});

describe("requisitos del fotograma", () => {
  test("listo: no falta nada", () => {
    expect(requisitosDelFotograma(FOTOGRAMA_LISTO)).toEqual([]);
  });

  test("cada bloqueo de siempre apunta a su campo y a su paso, en el mismo orden", () => {
    const r = requisitosDelFotograma({
      sinImagen: true,
      hayModeloSinImagen: false,
      haySujeto: true,
      sinTerceros: false,
      modeloSinReferencias: true,
      caracteresDescripcion: 3,
      motivosPlantilla: [ESCENA, PLANO],
    });
    expect(r.map((x) => [x.id, x.paso])).toEqual([
      [ID_SUJETO, "sujeto"],
      [ID_REVISION_FOTOGRAMA, "sujeto"],
      [ID_MODELO_FOTOGRAMA, "sujeto"],
      [ID_DESCRIPCION, "escena"],
      [ID_DESCRIPCION, "escena"],
      ["fotograma-plantilla", "escena"],
    ]);
    expect(r[3]?.texto).toBe("Falta describir la escena.");
    expect(r[1]?.texto).toBe("Falta confirmar la revisión de las fotos.");
  });
});

describe("requisitos del clip", () => {
  test("con una imagen tuya no hay paso de escena: la variable de texto se escribe en el paso del clip", () => {
    const r = requisitosDelClip({ ...CLIP_LISTO, sinPasoDeEscena: true, motivosPlantilla: [ESCENA] });
    expect(r).toEqual([{ id: ID_DESCRIPCION, paso: "clip", texto: "Falta «Qué ocurre en la escena»." }]);
  });

  test("con imagen tuya, un texto de 1 a 9 caracteres es un requisito del campo; vacío o de 10 en adelante, no", () => {
    const con = (n: number) =>
      requisitosDelClip({
        ...CLIP_LISTO,
        sinPasoDeEscena: true,
        etiquetaDeTexto: "Qué ocurre",
        caracteresDescripcion: n,
      });
    expect(con(4)).toEqual([
      { id: ID_DESCRIPCION, paso: "clip", texto: "Escribe al menos 10 caracteres en «Qué ocurre»." },
    ]);
    expect(con(9)).toHaveLength(1);
    expect(con(0)).toEqual([]);
    expect(con(10)).toEqual([]);
  });

  test("sin campo de texto en el paso del clip no se exige nada por la longitud", () => {
    expect(requisitosDelClip({ ...CLIP_LISTO, caracteresDescripcion: 4 })).toEqual([]);
  });

  test("con fotograma la variable de texto apunta al paso de la escena", () => {
    expect(requisitosDelClip({ ...CLIP_LISTO, motivosPlantilla: [ESCENA] })[0]?.paso).toBe("escena");
  });

  test("la revisión de las fotos del clip apunta a su casilla", () => {
    expect(requisitosDelClip({ ...CLIP_LISTO, exigeRevision: true, sinTerceros: false })).toEqual([
      { id: ID_REVISION_CLIP, paso: "clip", texto: "Falta confirmar la revisión de las fotos del personaje." },
    ]);
  });
});

describe("cuenta por paso y consulta por campo", () => {
  const lista: Requisito[] = [
    { id: "a", paso: "escena", texto: "1" },
    { id: "a", paso: "escena", texto: "1" },
    { id: "b", paso: "clip", texto: "2" },
  ];

  test("un mismo requisito que llega por dos envíos cuenta una vez", () => {
    expect(pendientesPorPaso(lista)).toEqual({ escena: 1, clip: 1 });
  });

  test("el error de un campo es el texto de su primer requisito", () => {
    expect(errorDeRequisito(lista, "b")).toBe("2");
    expect(errorDeRequisito(lista, "z")).toBeUndefined();
  });
});

describe("todos los requisitos de «Crear»", () => {
  const datos = {
    origen: "fotograma" as const,
    fotograma: FOTOGRAMA_LISTO,
    clip: CLIP_LISTO,
    frenosFotograma: [],
    frenosClip: [],
    casillasFotograma: { derechos: false, derechoMarca: false, avisoAceptado: false },
    casillasClip: { derechos: false, derechoMarca: false, avisoAceptado: false },
    conProducto: false,
    fotogramaSuperaUmbral: false,
    clipSuperaUmbral: false,
    clipPorConfirmar: true,
  };

  test("la lista completa incluye las casillas y la barra cuenta por paso", () => {
    const r = requisitosDeCrear(datos);
    expect(r.fotograma.map((x) => x.id)).toEqual(["fotograma-derechos"]);
    expect(r.clip.map((x) => x.id)).toEqual(["clip-derechos"]);
    expect(r.pendientes).toEqual({ coste: 1, clip: 1 });
  });

  test("con una imagen tuya no se cuenta el fotograma, y con el clip en marcha tampoco el clip", () => {
    expect(requisitosDeCrear({ ...datos, origen: "imagen" }).pendientes).toEqual({ clip: 1 });
    expect(requisitosDeCrear({ ...datos, clipPorConfirmar: false }).pendientes).toEqual({ coste: 1 });
  });

  test("la variable de texto de la plantilla es la obligatoria o, si no, la primera", () => {
    const v = (nombre: string, obligatoria: boolean) => ({
      nombre,
      tipo: "texto" as const,
      etiqueta: nombre,
      obligatoria,
    });
    expect(variableDeTexto([v("a", false), v("b", true)])?.nombre).toBe("b");
    expect(variableDeTexto([v("a", false)])?.nombre).toBe("a");
    expect(variableDeTexto([])).toBeNull();
  });
});
