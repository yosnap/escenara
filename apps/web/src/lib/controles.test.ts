import { describe, expect, test } from "bun:test";
import path from "node:path";
import {
  avisosPorConfirmar,
  bloqueosDeControles,
  EVALUACION_LISTA,
  type EvaluacionVista,
  evaluacionFallida,
  evaluacionPendiente,
  firmaDeAvisos,
  marcarNoFiable,
  peorEstado,
  REGLA_EVALUACION_FALLIDA,
  REGLAS_VERSION,
} from "./controles";

/**
 * Los cuatro estados de los controles previos y, sobre todo, **qué se muestra cuando no se ha podido comprobar
 * nada**.
 *
 * La regla que sostiene este fichero: no saber si se puede gastar **no es lo mismo que poder**. Un panel en verde
 * por un error de red sería la peor de las dos mentiras posibles, porque es la que invita a pulsar.
 */

const RAIZ = path.resolve(import.meta.dir, "..");

const avisoConfirmable = {
  regla: "precio-antiguo",
  estado: "ajustes" as const,
  motivo: "El precio se comprobó hace mucho.",
  accion: "Vuelve a comprobarlo.",
  enlace: null,
  confirmable: true,
};

describe("estados de los controles previos", () => {
  test("el peor estado gana, y sin frenos es «listo»", () => {
    expect(peorEstado([])).toBe("listo");
    expect(peorEstado(["listo", "ajustes"])).toBe("ajustes");
    expect(peorEstado(["ajustes", "revision"])).toBe("revision");
    expect(peorEstado(["revision", "bloqueado", "ajustes"])).toBe("bloqueado");
  });
});

describe("un fallo al evaluar nunca dice «listo»", () => {
  test("la evaluación fallida es «Requiere revisión», no salvable y con motivo y acción", () => {
    const evaluacion = evaluacionFallida(REGLAS_VERSION);
    expect(evaluacion.estado).toBe("revision");
    expect(evaluacion.comprobaciones).toHaveLength(1);
    const freno = evaluacion.comprobaciones[0];
    expect(freno?.regla).toBe(REGLA_EVALUACION_FALLIDA);
    expect(freno?.confirmable).toBe(false);
    expect(freno?.motivo.trim()).not.toBe("");
    expect(freno?.accion).toContain("Vuelve a cargar la página");
  });

  test("un fallo deshabilita el botón: aparece como bloqueo y no se puede confirmar", () => {
    const evaluacion = evaluacionFallida(REGLAS_VERSION);
    expect(bloqueosDeControles(evaluacion, [])).toHaveLength(1);
    // Ni listando su clave: no es un aviso, así que `avisosPorConfirmar` no lo contempla y el bloqueo se queda.
    expect(bloqueosDeControles(evaluacion, [REGLA_EVALUACION_FALLIDA])).toHaveLength(1);
    expect(avisosPorConfirmar(evaluacion, [])).toEqual([]);
  });

  test("marcar como no fiable conserva lo que se sabía y empeora el estado", () => {
    const previa: EvaluacionVista = {
      estado: "ajustes",
      reglasVersion: REGLAS_VERSION,
      comprobaciones: [avisoConfirmable],
    };
    const noFiable = marcarNoFiable(previa, "No se ha podido comprobar si puedes generar. Sin conexión.");
    expect(noFiable.estado).toBe("revision");
    // El aviso que el usuario ya había leído sigue ahí; el freno del fallo va **primero**, porque es lo urgente.
    expect(noFiable.comprobaciones.map((c) => c.regla)).toEqual([REGLA_EVALUACION_FALLIDA, "precio-antiguo"]);
    expect(noFiable.comprobaciones[0]?.motivo).toContain("Sin conexión");
    // Y el botón queda deshabilitado aunque el aviso estuviera confirmado.
    expect(bloqueosDeControles(noFiable, ["precio-antiguo"]).length).toBeGreaterThan(0);
  });

  test("marcar como no fiable dos veces no acumula el mismo freno", () => {
    const una = marcarNoFiable(EVALUACION_LISTA(REGLAS_VERSION));
    const dos = marcarNoFiable(una);
    expect(dos.comprobaciones.filter((c) => c.regla === REGLA_EVALUACION_FALLIDA)).toHaveLength(1);
    expect(dos.estado).toBe("revision");
  });

  test("un envío todavía sin evaluar tampoco dice «listo»", () => {
    const pendiente = evaluacionPendiente(REGLAS_VERSION);
    expect(pendiente.estado).toBe("revision");
    expect(pendiente.comprobaciones[0]?.confirmable).toBe(false);
    expect(bloqueosDeControles(pendiente, []).length).toBeGreaterThan(0);
  });
});

describe("confirmación de avisos", () => {
  test("un aviso sin confirmar bloquea; confirmado, deja pasar", () => {
    const evaluacion: EvaluacionVista = {
      estado: "ajustes",
      reglasVersion: REGLAS_VERSION,
      comprobaciones: [avisoConfirmable],
    };
    expect(bloqueosDeControles(evaluacion, [])).toHaveLength(1);
    expect(bloqueosDeControles(evaluacion, ["precio-antiguo"])).toEqual([]);
  });

  test("la firma de lo confirmado no depende del orden", () => {
    expect(firmaDeAvisos(["b", "a"])).toBe(firmaDeAvisos(["a", "b"]));
    expect(firmaDeAvisos(["a"])).not.toBe(firmaDeAvisos(["a", "b"]));
    expect(firmaDeAvisos([])).toBe("");
  });
});

describe("ningún camino de la interfaz cae en «listo» cuando falla", () => {
  // Guard de regresión: los dos sitios que evalúan para mostrar tienen que usar el camino que no miente. Si
  // alguien vuelve a poner `EVALUACION_LISTA` como red de un `catch`, esto falla.
  const CAMINOS = [
    path.join("app", "crear", "page.tsx"),
    path.join("app", "crear", "_componentes", "use-controles.ts"),
  ];

  for (const camino of CAMINOS) {
    test(`${camino} no usa EVALUACION_LISTA como red de un fallo`, async () => {
      const codigo = await Bun.file(path.join(RAIZ, camino)).text();
      expect(codigo).not.toContain("EVALUACION_LISTA");
      expect(/evaluacionFallida|marcarNoFiable/.test(codigo)).toBe(true);
    });
  }
});
