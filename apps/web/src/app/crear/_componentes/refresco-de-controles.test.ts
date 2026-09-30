import { describe, expect, test } from "bun:test";
import { EVALUACION_LISTA, type EvaluacionVista } from "@/lib/controles";
import type { Resultado } from "./api-generacion";
import { type ClipVigente, comprobarClipVigente, crearRefresco, type SujetoDeControles } from "./refresco-de-controles";

/** Una promesa que se resuelve cuando el test lo decide, para poder responder en el orden que se quiera. */
const diferida = <T>() => {
  let resolver!: (valor: T) => void;
  const promesa = new Promise<T>((r) => {
    resolver = r;
  });
  return { promesa, resolver };
};

// La versión de reglas hace de marca para reconocer cuál de las evaluaciones se ha pintado.
const evaluacion = (marca: string): EvaluacionVista => EVALUACION_LISTA(marca);
const ok = (marca: string): Resultado<EvaluacionVista> => ({ ok: true, datos: evaluacion(marca) });

/** Un refresco con todo lo que pinta apuntado, y cada respuesta en manos del test. */
function montar() {
  const pendientes: ReturnType<typeof diferida<Resultado<EvaluacionVista>>>[] = [];
  const pintado = { evaluaciones: [] as string[], fallos: [] as string[], cargando: [] as boolean[] };
  const refresco = crearRefresco<SujetoDeControles>(
    () => {
      const d = diferida<Resultado<EvaluacionVista>>();
      pendientes.push(d);
      return d.promesa;
    },
    {
      alCargar: (c) => pintado.cargando.push(c),
      alEvaluar: (e) => pintado.evaluaciones.push(e.reglasVersion),
      alFallar: (e) => pintado.fallos.push(e),
    },
  );
  return { refresco, pendientes, pintado };
}

const SUJETO: SujetoDeControles = { tipo: "animacion", modelo: "m", medioId: "img" };

describe("solo cuenta la última comprobación pedida", () => {
  test("una sola comprobación se pinta y termina la carga", async () => {
    const { refresco, pendientes, pintado } = montar();
    const espera = refresco.refrescar(SUJETO);
    pendientes[0]?.resolver(ok("A"));
    expect(await espera).toBeNull();
    expect(pintado.evaluaciones).toEqual(["A"]);
    expect(pintado.cargando).toEqual([true, false]);
  });

  test("con dos seguidas, la respuesta vieja que llega la última se descarta", async () => {
    const { refresco, pendientes, pintado } = montar();
    const primera = refresco.refrescar(SUJETO);
    const segunda = refresco.refrescar(SUJETO);
    // La segunda (la vigente) llega antes; la primera llega tarde con otro contenido.
    pendientes[1]?.resolver(ok("vigente"));
    await segunda;
    pendientes[0]?.resolver(ok("vieja"));
    expect(await primera).toBeNull();
    expect(pintado.evaluaciones).toEqual(["vigente"]);
  });

  test("con dos seguidas, la vieja que llega antes tampoco pinta y la vigente sí", async () => {
    const { refresco, pendientes, pintado } = montar();
    const primera = refresco.refrescar(SUJETO);
    const segunda = refresco.refrescar(SUJETO);
    pendientes[0]?.resolver(ok("vieja"));
    await primera;
    // Mientras la vigente no responda sigue cargando: la vieja no la ha dado por terminada.
    expect(pintado.cargando).toEqual([true, true]);
    pendientes[1]?.resolver(ok("vigente"));
    await segunda;
    expect(pintado.evaluaciones).toEqual(["vigente"]);
    expect(pintado.cargando).toEqual([true, true, false]);
  });

  test("el fallo de una comprobación vieja no se enseña, el de la vigente sí", async () => {
    const { refresco, pendientes, pintado } = montar();
    const primera = refresco.refrescar(SUJETO);
    const segunda = refresco.refrescar(SUJETO);
    pendientes[0]?.resolver({ ok: false, error: "fallo viejo" });
    expect(await primera).toBeNull();
    pendientes[1]?.resolver({ ok: false, error: "fallo vigente" });
    expect(await segunda).toBe("fallo vigente");
    expect(pintado.fallos).toEqual(["fallo vigente"]);
    expect(pintado.evaluaciones).toEqual([]);
  });

  test("si la pantalla se ha desmontado, lo que llegue no se pinta; al volver a abrirse, sí", async () => {
    const { refresco, pendientes, pintado } = montar();
    const espera = refresco.refrescar(SUJETO);
    refresco.cerrar();
    pendientes[0]?.resolver(ok("tarde"));
    expect(await espera).toBeNull();
    expect(pintado.evaluaciones).toEqual([]);

    refresco.abrir();
    const otra = refresco.refrescar(SUJETO);
    pendientes[1]?.resolver(ok("de nuevo"));
    await otra;
    expect(pintado.evaluaciones).toEqual(["de nuevo"]);
  });
});

describe("el clip se comprueba con lo vigente al preguntar", () => {
  const SIN_PRODUCTO = { productoId: "", accion: "" };
  const vigente = (v: ClipVigente) => ({ current: v });

  test("tras una espera, un producto elegido mientras tanto es el que se evalúa", async () => {
    const ref = vigente({ modelo: "veo", producto: SIN_PRODUCTO });
    const sujetos: SujetoDeControles[] = [];
    const refrescar = async (s: SujetoDeControles) => {
      sujetos.push(s);
      return null;
    };
    // El fotograma termina: se pide la estimación y, mientras responde, la persona elige un producto.
    const estimacion = diferida<void>();
    const alCambiarFotograma = async () => {
      await estimacion.promesa;
      return comprobarClipVigente(ref, "fotograma-1", refrescar);
    };
    const espera = alCambiarFotograma();
    ref.current = { modelo: "minimax", producto: { productoId: "p1", accion: "sostenerlo" } };
    estimacion.resolver();
    await espera;
    expect(sujetos).toEqual([
      { tipo: "animacion", modelo: "minimax", medioId: "fotograma-1", productoId: "p1", accion: "sostenerlo" },
    ]);
  });

  test("lo que la propia acción acaba de elegir manda sobre lo vigente", async () => {
    const ref = vigente({ modelo: "veo", producto: { productoId: "p1", accion: "abrirlo" } });
    const sujetos: SujetoDeControles[] = [];
    const refrescar = async (s: SujetoDeControles) => {
      sujetos.push(s);
      return null;
    };
    await comprobarClipVigente(ref, "img", refrescar, { modelo: "omni" });
    await comprobarClipVigente(ref, "img", refrescar, { producto: SIN_PRODUCTO });
    expect(sujetos[0]).toMatchObject({ modelo: "omni", productoId: "p1", accion: "abrirlo" });
    // Quitar el producto no manda ni producto ni acción.
    expect(sujetos[1]).toEqual({ tipo: "animacion", modelo: "veo", medioId: "img" });
  });

  test("devuelve el error de la comprobación para que se diga", async () => {
    const ref = vigente({ modelo: "veo", producto: SIN_PRODUCTO });
    expect(await comprobarClipVigente(ref, "img", async () => "sin conexión")).toBe("sin conexión");
  });
});
