import { describe, expect, test } from "bun:test";
import type {
  FilaConsentimiento,
  FilaMedio,
  FilaPersonaje,
  FilaReferencia,
  FilaRegistroOmni,
  FilaVersionPersonaje,
} from "../src/server/db/esquema";
import {
  claveNueva,
  decidirAccion,
  type EstadoCopia,
  type FilaProyecto,
  idsDeMedios,
  leerArgumentos,
  motivoParaNoCopiar,
  type OrigenPersonaje,
  planificarCopia,
  recuentoDe,
  versionDelRegistro,
} from "./personaje-demo";

/**
 * La copia de un personaje a la cuenta de demostración, sin base de datos: qué filas y medios se copian, quién
 * queda como dueño de cada cosa, que un personaje real no se copia nunca y que repetirla no duplica.
 */

const ORIGEN = "00000000-0000-4000-8000-0000000000a1";
const DESTINO = "00000000-0000-4000-8000-0000000000d1";
const PERSONAJE = "00000000-0000-4000-8000-0000000000c1";
const fecha = new Date("2026-09-28T10:00:00Z");

const personaje = (parcial: Partial<FilaPersonaje> = {}): FilaPersonaje => ({
  id: PERSONAJE,
  ownerId: ORIGEN,
  name: "Elisa",
  kind: "persona",
  speciesNotes: "",
  description: "Mujer inventada",
  traits: "",
  style: "",
  wardrobe: "",
  personality: "",
  voice: "",
  virtual: true,
  renderStyle: "realista",
  styleGuide: { preset: "", prompt: "", paleta: "", trazo: "", detalle: "", referencias: [] },
  masterFrameMediaId: null,
  beautyOptIn: false,
  voiceAxes: {},
  voicePresetId: "",
  identitySheetMediaId: null,
  identitySheetStatus: "candidata",
  identitySheetTrial: false,
  state: "listo",
  createdAt: fecha,
  updatedAt: fecha,
  ...parcial,
});

const consentimiento = (parcial: Partial<FilaConsentimiento> = {}): FilaConsentimiento => ({
  id: "consentimiento-1",
  characterId: PERSONAJE,
  holderType: "inventado",
  adultDeclared: false,
  syntheticDeclared: true,
  coherenceDeclared: false,
  usageScope: "comercial",
  documentMediaId: null,
  registeredBy: ORIGEN,
  registeredAt: fecha,
  reviewedBy: null,
  reviewedAt: null,
  reviewApproved: null,
  reviewNote: "",
  revokedAt: null,
  revocationReason: "",
  ...parcial,
});

const medio = (id: string, parcial: Partial<FilaMedio> = {}): FilaMedio => ({
  id,
  ownerId: ORIGEN,
  kind: "imagen",
  storageKey: `media/2026/09/${id}.webp`,
  originalName: `${id}.webp`,
  mimeType: "image/webp",
  sizeBytes: 1000,
  width: 768,
  height: 1024,
  durationSeconds: null,
  sourceUrl: null,
  title: "",
  altEs: "",
  altEn: "",
  isDocument: false,
  characterSheetOf: null,
  createdAt: fecha,
  updatedAt: fecha,
  deletedAt: null,
  ...parcial,
});

const referencia = (mediaId: string, orden: number, parcial: Partial<FilaReferencia> = {}): FilaReferencia => ({
  id: `ref-${mediaId}`,
  characterId: PERSONAJE,
  mediaId,
  origin: "vista_generada",
  declaredView: "",
  viewKey: orden === 0 ? "frontal" : "perfil_izquierdo",
  width: 768,
  height: 1024,
  sharpness: null,
  brightness: null,
  faceRatio: null,
  phash: null,
  rejectionReason: null,
  identityVerdict: "sin_comprobar",
  identityReason: "",
  sortOrder: orden,
  createdAt: fecha,
  ...parcial,
});

const version = (
  id: string,
  numero: number,
  imagenes: string[],
  parcial: Partial<FilaVersionPersonaje> = {},
): FilaVersionPersonaje => ({
  id,
  characterId: PERSONAJE,
  number: numero,
  sheet: {
    rasgos: "pelo rizado",
    estilo: "",
    vestuario: "",
    personalidad: "",
    voz: "",
    descripcion: "Mujer inventada",
  },
  referenceMediaIds: imagenes,
  referenceViewKeys: imagenes.map((_, i) => (i === 0 ? "frontal" : "perfil_izquierdo")),
  sheetMediaId: null,
  changeReason: "",
  changedFields: [],
  invalidatedApprovals: 0,
  createdBy: ORIGEN,
  createdAt: fecha,
  ...parcial,
});

const registro = (versionId: string, parcial: Partial<FilaRegistroOmni> = {}): FilaRegistroOmni => ({
  id: "registro-1",
  characterId: PERSONAJE,
  characterVersionId: versionId,
  audioId: "voz-omni",
  remoteCharacterId: "remoto-1",
  remoteImageUrl: "",
  remoteBodyImageUrl: "",
  portraitMediaId: "m1",
  bodyMediaId: "m2",
  creditsSpent: 0,
  registeredBy: ORIGEN,
  registeredAt: fecha,
  supersededAt: null,
  supersededReason: "",
  ...parcial,
});

const proyecto = { omniAudioId: "voz-omni", omniVoice: "Kore", format: "reel_vertical" } as unknown as FilaProyecto;

/** Elisa tal como está en la base: dos imágenes, la versión 1 registrada y la 2 solo con el orden cambiado. */
const origen = (parcial: Partial<OrigenPersonaje> = {}): OrigenPersonaje => ({
  personaje: personaje(),
  consentimientos: [consentimiento()],
  referencias: [referencia("m1", 0), referencia("m2", 1)],
  versiones: [
    version("v1", 1, ["m1", "m2"], { sheetMediaId: "hoja" }),
    version("v2", 2, ["m2", "m1"], {
      referenceViewKeys: ["perfil_izquierdo", "frontal"],
      sheet: {
        rasgos: "pelo rizado",
        estilo: "",
        vestuario: "",
        personalidad: "",
        voz: "",
        descripcion: "Mujer inventada",
        renderStyle: "realista",
        styleGuide: { preset: "", prompt: "", paleta: "", trazo: "", detalle: "", referencias: [] },
      },
    }),
  ],
  registros: [registro("v1")],
  aprobaciones: [],
  medios: [medio("m1"), medio("m2"), medio("hoja", { characterSheetOf: PERSONAJE })],
  proyectoOmni: proyecto,
  ...parcial,
});

let contador = 0;
const opciones = () => ({
  destinoId: DESTINO,
  personajeId: "copia-1",
  proyectoId: "proyecto-1",
  ahora: new Date("2026-10-16T08:00:00Z"),
  nuevoId: () => `nuevo-${++contador}`,
});

describe("solo se copian personajes inventados", () => {
  test("Elisa, inventada y con su declaración vigente, se puede copiar", () => {
    expect(motivoParaNoCopiar(origen(), DESTINO)).toBeNull();
  });

  test("una persona o un animal reales no se copian", () => {
    const real = origen({
      personaje: personaje({ virtual: false }),
      consentimientos: [consentimiento({ holderType: "yo", syntheticDeclared: false })],
    });
    expect(motivoParaNoCopiar(real, DESTINO)).toContain("reales");
    const animal = origen({
      personaje: personaje({ virtual: false, kind: "animal" }),
      consentimientos: [consentimiento({ holderType: "animal_propio", syntheticDeclared: false })],
    });
    expect(motivoParaNoCopiar(animal, DESTINO)).toContain("reales");
    expect(() => planificarCopia(real, opciones())).toThrow("reales");
  });

  test("marcado como inventado no basta sin la declaración sintética vigente", () => {
    const sinDeclarar = origen({ consentimientos: [consentimiento({ syntheticDeclared: false })] });
    expect(motivoParaNoCopiar(sinDeclarar, DESTINO)).toContain("no está declarado");
    const deTercero = origen({ consentimientos: [consentimiento({ holderType: "tercero" })] });
    expect(motivoParaNoCopiar(deTercero, DESTINO)).toContain("no está declarado");
    const revocada = origen({ consentimientos: [consentimiento({ revokedAt: fecha })] });
    expect(motivoParaNoCopiar(revocada, DESTINO)).toContain("declaración vigente");
  });

  test("un documento de consentimiento o una foto original delatan material real", () => {
    const conDocumento = origen({ consentimientos: [consentimiento({ documentMediaId: "doc" })] });
    expect(motivoParaNoCopiar(conDocumento, DESTINO)).toContain("documento");
    const conFoto = origen({ referencias: [referencia("m1", 0, { origin: "foto_original" })] });
    expect(motivoParaNoCopiar(conFoto, DESTINO)).toContain("fotos originales");
  });

  test("no se copia a la misma cuenta", () => {
    expect(motivoParaNoCopiar(origen(), ORIGEN)).toContain("ya es de la cuenta");
  });
});

describe("selección de filas y medios", () => {
  test("recoge cara, vistas, hojas, retratos registrados y fotograma maestro sin repetir", () => {
    const o = origen({ personaje: personaje({ masterFrameMediaId: "maestro" }) });
    expect(idsDeMedios(o).sort()).toEqual(["hoja", "m1", "m2", "maestro"]);
  });

  test("la clave nueva conserva la extensión y nunca reutiliza la de origen", () => {
    const ahora = new Date("2026-10-16T08:00:00Z");
    expect(claveNueva("media/2026/09/abc.webp", "u1", ahora)).toBe("media/2026/10/u1.webp");
    expect(claveNueva("media/2026/09/sin-extension", "u2", ahora)).toBe("media/2026/10/u2.bin");
    expect(claveNueva("media/x/raro.we/bp", "u3", ahora)).toBe("media/2026/10/u3.bin");
  });

  test("todo lo copiado es de la cuenta de destino, con identificadores y claves nuevos", () => {
    const o = origen();
    const plan = planificarCopia(o, opciones());
    expect(plan.personaje).toMatchObject({ id: "copia-1", ownerId: DESTINO, name: "Elisa", virtual: true });
    expect(plan.medios).toHaveLength(3);
    for (const m of plan.medios) {
      expect(m.fila.ownerId).toBe(DESTINO);
      expect(o.medios.some((original) => original.id === m.fila.id || original.storageKey === m.fila.storageKey)).toBe(
        false,
      );
    }
    const nuevos = new Set(plan.medios.map((m) => m.fila.id));
    expect(plan.referencias.every((r) => nuevos.has(r.mediaId))).toBe(true);
    expect(plan.versiones.flatMap((v) => v.referenceMediaIds).every((id) => nuevos.has(id))).toBe(true);
    // La hoja de personaje queda marcada con la copia, no con el original.
    expect(plan.medios.find((m) => m.claveOrigen.includes("hoja"))?.fila.characterSheetOf).toBe("copia-1");
    // Ninguna fila cita al usuario original.
    expect(JSON.stringify(plan)).not.toContain(ORIGEN);
    expect(plan.consentimientos[0]).toMatchObject({
      holderType: "inventado",
      syntheticDeclared: true,
      registeredBy: DESTINO,
    });
  });

  test("el proyecto Omni de destino lleva la voz registrada y la copia como protagonista", () => {
    const plan = planificarCopia(origen(), opciones());
    expect(plan.proyecto).toMatchObject({
      id: "proyecto-1",
      userId: DESTINO,
      voiceMode: "omni",
      omniAudioId: "voz-omni",
      mainCharacterId: "copia-1",
    });
    expect(planificarCopia(origen({ proyectoOmni: null }), opciones()).proyecto).toBeNull();
  });

  test("falla si falta un medio imprescindible, pero no por uno histórico de una versión antigua", () => {
    expect(() => planificarCopia(origen({ medios: [medio("m1"), medio("hoja")] }), opciones())).toThrow("Faltan 1");
    const conHistoria = origen({
      versiones: [version("v0", 0, ["borrado"]), ...origen().versiones],
    });
    const plan = planificarCopia(conHistoria, opciones());
    expect(plan.versiones.find((v) => v.number === 0)?.referenceMediaIds).toEqual(["borrado"]);
  });
});

describe("registro para escenas habladas", () => {
  test("si la versión vigente es la misma cara solo reordenada, el registro pasa a la vigente", () => {
    const o = origen();
    expect(versionDelRegistro(o.versiones, registro("v1"))).toBe("v2");
    const plan = planificarCopia(o, opciones());
    const vigente = plan.versiones.find((v) => v.number === 2);
    expect(plan.registros[0]?.characterVersionId).toBe(vigente?.id);
  });

  test("si la ficha o las imágenes cambiaron, se conserva la versión registrada", () => {
    const o = origen();
    const otraCara = [o.versiones[0] as FilaVersionPersonaje, version("v2", 2, ["m1"])];
    expect(versionDelRegistro(otraCara, registro("v1"))).toBe("v1");
    const otraFicha = [
      o.versiones[0] as FilaVersionPersonaje,
      version("v2", 2, ["m1", "m2"], {
        sheet: { rasgos: "pelo liso", estilo: "", vestuario: "", personalidad: "", voz: "", descripcion: "" },
      }),
    ];
    expect(versionDelRegistro(otraFicha, registro("v1"))).toBe("v1");
    expect(versionDelRegistro(o.versiones, registro("v1", { supersededAt: fecha }))).toBe("v1");
  });
});

describe("idempotencia", () => {
  const completa = (parcial: Partial<EstadoCopia> = {}): EstadoCopia => ({
    id: "copia-1",
    inventado: true,
    recuento: recuentoDe(origen()),
    mediosAjenos: 0,
    usos: 0,
    ...parcial,
  });

  test("sin copia se crea; con la copia completa se deja igual", () => {
    expect(decidirAccion(recuentoDe(origen()), null)).toEqual({ tipo: "crear" });
    expect(decidirAccion(recuentoDe(origen()), completa())).toEqual({ tipo: "dejar", id: "copia-1" });
  });

  test("una copia a medias o con medios ajenos se reemplaza conservando su identificador", () => {
    const aMedias = completa({ recuento: { ...recuentoDe(origen()), referencias: 1 } });
    expect(decidirAccion(recuentoDe(origen()), aMedias)).toEqual({ tipo: "reemplazar", id: "copia-1" });
    expect(decidirAccion(recuentoDe(origen()), completa({ mediosAjenos: 2 }))).toEqual({
      tipo: "reemplazar",
      id: "copia-1",
    });
    expect(decidirAccion(recuentoDe(origen()), completa(), true)).toEqual({ tipo: "reemplazar", id: "copia-1" });
  });

  test("no reemplaza un personaje real con el mismo nombre ni una copia ya usada", () => {
    expect(() => decidirAccion(recuentoDe(origen()), completa({ inventado: false }))).toThrow("personaje real");
    expect(() => decidirAccion(recuentoDe(origen()), completa({ usos: 3 }), true)).toThrow("no se reemplaza");
  });
});

describe("argumentos", () => {
  test("la cuenta de destino es obligatoria y el personaje por defecto es Elisa", () => {
    expect(() => leerArgumentos([])).toThrow("--destino");
    expect(leerArgumentos(["--destino", "tutoriales@escenara.test"])).toEqual({
      personaje: "Elisa",
      destino: "tutoriales@escenara.test",
      forzar: false,
    });
  });

  test("acepta otro personaje y el reemplazo forzado, y rechaza lo que no entiende", () => {
    expect(leerArgumentos(["--destino", DESTINO, "--personaje", "Nora", "--reemplazar"])).toEqual({
      personaje: "Nora",
      destino: DESTINO,
      forzar: true,
    });
    expect(() => leerArgumentos(["--destino", "--reemplazar"])).toThrow("necesita un valor");
    expect(() => leerArgumentos(["--destino", DESTINO, "--rol", "admin"])).toThrow("desconocida");
  });
});
