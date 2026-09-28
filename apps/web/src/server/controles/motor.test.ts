import { describe, expect, test } from "bun:test";
import path from "node:path";
import { ESTADOS_CONTROL, type EstadoControl, REGLAS_VERSION } from "@/lib/controles";
import type { Hechos } from "./contrato";
import { avisosSalvables, evaluar, frenosQueGatean } from "./motor";

/**
 * El motor de reglas es **puro**: sin base de datos, sin red y sin reloj. Por eso este test no es de
 * integración y puede recorrer **todas** las reglas, que es justo el criterio de aceptación de la fase:
 * cada freno tiene que devolver motivo y acción no vacíos, y ninguno de los que no se pueden salvar puede
 * volverse salvable por venir marcado.
 */

const PARAMETROS = { exigirCoberturaVistas: true, exigirPrecioFresco: true, maximoAvisos: 3 };

/** Hechos con todo en orden: cada test rompe **una** cosa y comprueba qué dice el motor. */
const todoBien = (): Hechos => ({
  tipo: "fotograma",
  parametros: PARAMETROS,
  credencial: { nombreProveedor: "KIE.ai", proveedorAdmitido: true, motivo: null, saldo: 500 },
  modelo: {
    nombre: "Nano Banana 2 Lite",
    maximoReferencias: 6,
    precioComprobado: "2026-09-27",
    precioCaducado: false,
    costeAcotado: true,
    motivoSinAcotar: "",
  },
  personaje: { nombre: "Lucía", impedimentos: [], vistasSinCubrir: [], referenciasSenaladas: 0 },
  presupuesto: {
    creditos: 10,
    topeTrabajo: 500,
    disponibleUsuario: 1000,
    retenidoUsuario: 0,
    trabajosEnRevision: 0,
    llamadasDeTextoColgadas: 0,
    revisionesColgadas: 0,
    autorizadoProyecto: 1000,
    comprometidoProyecto: 0,
  },
  cuota: { previstoBytes: 1_000, libresBytes: 10_000_000 },
  escena: {
    planAprobado: true,
    aprobada: true,
    motivoInvalidacion: "",
    guionEnClipMudo: false,
    precioCambiado: false,
    fichaCambiada: false,
    plantillaCambiada: false,
    afirmacionesPorVerificar: 0,
  },
});

/** Cada regla del motor con los hechos que la disparan y el estado que le corresponde. */
const CASOS: { regla: string; estado: Exclude<EstadoControl, "listo">; romper: (h: Hechos) => void }[] = [
  {
    regla: "credencial-sin-soporte",
    estado: "bloqueado",
    romper: (h) => {
      if (h.credencial) h.credencial.proveedorAdmitido = false;
    },
  },
  {
    regla: "credencial",
    estado: "bloqueado",
    romper: (h) => {
      if (h.credencial) h.credencial.motivo = "invalida";
    },
  },
  {
    regla: "consentimiento",
    estado: "bloqueado",
    romper: (h) => {
      if (h.personaje) h.personaje.impedimentos = ["El consentimiento está revocado."];
    },
  },
  {
    regla: "modelo-sin-referencias",
    estado: "bloqueado",
    romper: (h) => {
      if (h.modelo) h.modelo.maximoReferencias = 0;
    },
  },
  {
    regla: "plan-sin-aprobar",
    estado: "bloqueado",
    romper: (h) => {
      if (h.escena) h.escena.planAprobado = false;
    },
  },
  {
    regla: "cuota",
    estado: "bloqueado",
    romper: (h) => {
      if (h.cuota) h.cuota.libresBytes = 10;
    },
  },
  {
    regla: "saldo",
    estado: "bloqueado",
    romper: (h) => {
      if (h.credencial) h.credencial.saldo = 1;
    },
  },
  {
    regla: "tope-trabajo",
    estado: "bloqueado",
    romper: (h) => {
      if (h.presupuesto) h.presupuesto.topeTrabajo = 5;
    },
  },
  {
    regla: "presupuesto-usuario",
    estado: "bloqueado",
    romper: (h) => {
      if (h.presupuesto) h.presupuesto.disponibleUsuario = 2;
    },
  },
  {
    regla: "presupuesto-proyecto",
    estado: "bloqueado",
    romper: (h) => {
      if (h.presupuesto) h.presupuesto.comprometidoProyecto = 999;
    },
  },
  {
    regla: "escena-sin-aprobar",
    estado: "revision",
    romper: (h) => {
      if (h.escena) h.escena.aprobada = false;
    },
  },
  {
    regla: "aprobacion-precio",
    estado: "revision",
    romper: (h) => {
      if (h.escena) h.escena.precioCambiado = true;
    },
  },
  {
    regla: "aprobacion-ficha",
    estado: "revision",
    romper: (h) => {
      if (h.escena) h.escena.fichaCambiada = true;
    },
  },
  {
    regla: "aprobacion-plantilla",
    estado: "revision",
    romper: (h) => {
      if (h.escena) h.escena.plantillaCambiada = true;
    },
  },
  {
    regla: "afirmaciones-sin-verificar",
    estado: "revision",
    romper: (h) => {
      if (h.escena) h.escena.afirmacionesPorVerificar = 2;
    },
  },
  {
    regla: "referencias-cobertura",
    estado: "ajustes",
    romper: (h) => {
      if (h.personaje) h.personaje.vistasSinCubrir = ["perfil_derecho"];
    },
  },
  {
    regla: "precio-antiguo",
    estado: "ajustes",
    romper: (h) => {
      if (h.modelo) h.modelo.precioCaducado = true;
    },
  },
  {
    regla: "coste-no-acotable",
    estado: "ajustes",
    romper: (h) => {
      if (h.modelo) {
        h.modelo.costeAcotado = false;
        h.modelo.motivoSinAcotar = "Ese modelo no declara cuánto dura el clip.";
      }
    },
  },
];

describe("motor de controles previos", () => {
  test("con todo en orden el estado es listo y no hay ningún freno", () => {
    const evaluacion = evaluar(todoBien());
    expect(evaluacion.estado).toBe("listo");
    expect(evaluacion.frenos).toEqual([]);
    expect(evaluacion.reglasVersion).toBe(REGLAS_VERSION);
  });

  test("la evaluación es determinista: la misma entrada da el mismo resultado", () => {
    const hechos = todoBien();
    if (hechos.credencial) hechos.credencial.motivo = "sin-credencial";
    expect(evaluar(hechos)).toEqual(evaluar(hechos));
  });

  // Criterio de aceptación: **cada** freno devuelve motivo y siguiente acción no vacíos.
  for (const caso of CASOS) {
    test(`la regla «${caso.regla}» dice estado, motivo y acción`, () => {
      const hechos = todoBien();
      caso.romper(hechos);
      const freno = evaluar(hechos).frenos.find((f) => f.regla === caso.regla);
      expect(freno).toBeDefined();
      expect(freno?.estado).toBe(caso.estado);
      expect(freno?.motivo.trim()).not.toBe("");
      expect(freno?.accion.trim()).not.toBe("");
    });
  }

  test("las 18 reglas están cubiertas por este test", () => {
    // Si alguien añade una regla sin añadir su caso, esto falla: una regla sin test es una regla sin motivo
    // comprobado. Se disparan todas a la vez y se comparan las claves.
    const hechos = todoBien();
    for (const caso of CASOS) caso.romper(hechos);
    const disparadas = new Set(evaluar(hechos).frenos.map((f) => f.regla));
    // `modelo-sin-referencias` y `coste-no-acotable` se disparan las dos con el mismo grupo de hechos roto.
    for (const caso of CASOS) expect(disparadas.has(caso.regla)).toBe(true);
    expect(disparadas.size).toBe(CASOS.length);
  });

  test("el estado global es el peor de los frenos", () => {
    const hechos = todoBien();
    if (hechos.modelo) hechos.modelo.precioCaducado = true;
    expect(evaluar(hechos).estado).toBe("ajustes");
    if (hechos.escena) hechos.escena.aprobada = false;
    expect(evaluar(hechos).estado).toBe("revision");
    if (hechos.credencial) hechos.credencial.motivo = "sin-credencial";
    expect(evaluar(hechos).estado).toBe("bloqueado");
  });

  test("solo un aviso puede ser salvable: ni un bloqueo ni una revisión lo son nunca", () => {
    const hechos = todoBien();
    for (const caso of CASOS) caso.romper(hechos);
    for (const freno of evaluar(hechos).frenos) {
      expect(ESTADOS_CONTROL).toContain(freno.estado);
      if (freno.estado !== "ajustes") expect(freno.confirmable).toBe(false);
    }
  });

  test("los frenos que cierran puerta excluyen los avisos salvables", () => {
    const hechos = todoBien();
    if (hechos.modelo) hechos.modelo.precioCaducado = true;
    const evaluacion = evaluar(hechos);
    expect(avisosSalvables(evaluacion).map((f) => f.regla)).toEqual(["precio-antiguo"]);
    expect(frenosQueGatean(evaluacion)).toEqual([]);
  });

  test("un coste que no se puede acotar avisa pero no cierra ninguna puerta", () => {
    // Desde 0.12.0 el trabajo queda `esperando_limite` y no sale hasta que el usuario fija su techo: ese paso
    // **es** la acción del aviso, así que pedir además una casilla no añadiría nada.
    const hechos = todoBien();
    if (hechos.modelo) {
      hechos.modelo.costeAcotado = false;
      hechos.modelo.motivoSinAcotar = "Ese modelo no declara cuánto dura el clip.";
    }
    const evaluacion = evaluar(hechos);
    expect(evaluacion.estado).toBe("ajustes");
    expect(frenosQueGatean(evaluacion)).toEqual([]);
    expect(avisosSalvables(evaluacion)).toEqual([]);
  });

  test("un grupo de hechos que no está no se evalúa, y su ausencia no inventa ningún freno", () => {
    // Es lo que permite mirar una escena del plan antes de haber elegido modelo: no hay credencial ni coste
    // que comparar, así que esas reglas no dicen nada. Quien encola tiene que aportarlos todos, y la puerta
    // lo exige (`puerta.ts › exigirHechosCompletos`).
    const escena = todoBien().escena;
    if (!escena) throw new Error("Los hechos de ejemplo tienen escena.");
    const soloEscena: Hechos = {
      tipo: "fotograma",
      parametros: PARAMETROS,
      escena: { ...escena, aprobada: false, motivoInvalidacion: "Se editó la escena." },
    };
    const evaluacion = evaluar(soloEscena);
    expect(evaluacion.estado).toBe("revision");
    expect(evaluacion.frenos.map((f) => f.regla)).toEqual(["escena-sin-aprobar"]);
    expect(evaluacion.frenos[0]?.motivo).toContain("Se editó la escena.");
  });

  test("sin personaje no se evalúa ninguna regla de personaje", () => {
    const hechos = todoBien();
    hechos.personaje = null;
    if (hechos.modelo) hechos.modelo.maximoReferencias = 0;
    expect(evaluar(hechos).frenos).toEqual([]);
  });

  test("generar una vista que falta no avisa de las vistas sin cubrir, pero sí de las fotos señaladas", () => {
    const hechos = todoBien();
    if (!hechos.personaje) throw new Error("La base de prueba lleva personaje.");
    hechos.personaje.vistasSinCubrir = ["frontal", "perfil_derecho"];
    hechos.personaje.completaCobertura = true;
    expect(evaluar(hechos).frenos).toEqual([]);

    hechos.personaje.referenciasSenaladas = 1;
    const frenos = evaluar(hechos).frenos;
    expect(frenos.map((f) => f.regla)).toEqual(["referencias-cobertura"]);
    expect(frenos[0]?.motivo).not.toContain("faltan fotos");
  });

  test("solo un aviso puede dejar de cerrar puerta, aunque la regla venga mal declarada", () => {
    // `gatea: false` en un `bloqueado` o en un `revision` sería un freno que no frena: un pase gratis escrito por
    // descuido. El motor lo corrige, así que aquí se comprueba sobre **todas** las reglas a la vez.
    const hechos = todoBien();
    for (const caso of CASOS) caso.romper(hechos);
    for (const freno of evaluar(hechos).frenos) {
      if (freno.estado !== "ajustes") expect(freno.gatea).toBe(true);
    }
    // Y el único que hoy no cierra puerta sigue siendo un aviso.
    const sinGatear = evaluar(hechos).frenos.filter((f) => !f.gatea);
    expect(sinGatear.map((f) => f.regla)).toEqual(["coste-no-acotable"]);
    expect(sinGatear.every((f) => f.estado === "ajustes")).toBe(true);
  });
});

describe("el catálogo sembrado frente a la regla de referencias", () => {
  test("ningún modelo de imagen o de vídeo del catálogo declara 0 fotos de referencia", async () => {
    /**
     * Anotado tras la revisión de la 0.18.0: con el catálogo que se siembra, `modelo-sin-referencias` **no se
     * alcanza** por configuración de fábrica. Los modelos de `image_edit` declaran 10, 10 y 1, y los de
     * `image_to_video` declaran 2, 1 y 1; el único con 0 es el de texto (`gpt-5-6-sol`), que nunca recibe
     * referencias. La regla existe para lo que **sí** puede pasar: que quien administra edite los parámetros de un
     * modelo en `/admin/modelos` y lo deje sin referencias mientras alguien genera con un personaje.
     *
     * Si este test falla, es que la semilla ha cambiado y un camino de fábrica ha pasado a estar bloqueado: hay
     * que mirar si es a propósito.
     */
    const catalogo = (await Bun.file(path.join(import.meta.dir, "../proveedores/catalogo.json")).json()) as {
      modelos: { modelo: string; capacidades: string[]; parametros?: { maximoReferencias?: number } }[];
    };
    const conReferencias = catalogo.modelos.filter((m) =>
      m.capacidades.some((c) => c === "image_edit" || c === "image_to_video"),
    );
    expect(conReferencias.length).toBeGreaterThan(0);
    for (const modelo of conReferencias) {
      expect(modelo.parametros?.maximoReferencias ?? 0).toBeGreaterThan(0);
    }
  });
});

/** La escena del fixture, ya sin opcionalidad: sin ella no hay nada que comprobar de una escena. */
const escenaDe = (hechos: Hechos) => {
  if (!hechos.escena) throw new Error("El fixture tiene que traer escena.");
  return hechos.escena;
};

test("un guion escrito en una escena de voz en off avisa, y se puede confirmar", () => {
  // El clip saldrá mudo y esa frase no viaja: es dinero, así que se confirma expresamente.
  const base = todoBien();
  const evaluacion = evaluar({ ...base, escena: { ...escenaDe(base), guionEnClipMudo: true } });
  const aviso = evaluacion.frenos.find((f) => f.regla === "guion-en-clip-mudo");
  expect(aviso?.estado).toBe("ajustes");
  expect(aviso?.confirmable).toBe(true);
  expect(aviso?.motivo).toContain("mudo");
});

test("sin guion en voz en off no hay nada que avisar", () => {
  const base = todoBien();
  const evaluacion = evaluar({ ...base, escena: { ...escenaDe(base), guionEnClipMudo: false } });
  expect(evaluacion.frenos.some((f) => f.regla === "guion-en-clip-mudo")).toBe(false);
});
