import { describe, expect, test } from "bun:test";
import { ETAPAS_EXPORTACION, RECORTE_MINIMO_SEGUNDOS, SEGUNDOS_MAXIMOS_MONTAJE } from "./montaje";
import {
  aEditables,
  anadirEscena,
  avisoDeDuracion,
  type BorradorMontaje,
  duracionDelBorrador,
  etapasEnPantalla,
  firmaDeGuardado,
  moverFragmento,
  quitarFragmento,
  recortar,
  reordenarPorClaves,
  SEGUNDOS_RAZONABLES_MONTAJE,
  sinClaves,
} from "./montaje-pantalla";

/**
 * Los mandos de la pantalla de montaje (0.32.0). Lo que se comprueba aquí es que **ningún mando deja la línea de
 * tiempo en un estado imposible** y que «sin guardar» significa de verdad que algo ha cambiado.
 */

const tres = () =>
  aEditables([
    { escenaId: "e1", entrada: 0, salida: 4 },
    { escenaId: "e2", entrada: 1, salida: 5 },
    { escenaId: "e3", entrada: 0, salida: 2 },
  ]);

describe("reordenar", () => {
  test("el arrastre deja la lista en el orden que dicen las claves", () => {
    const orden = reordenarPorClaves(tres(), ["f3", "f1", "f2"]);
    expect(orden.map((f) => f.escenaId)).toEqual(["e3", "e1", "e2"]);
  });

  test("una clave que el arrastre no menciona no se pierde: se queda al final", () => {
    const orden = reordenarPorClaves(tres(), ["f2", "f1"]);
    expect(orden.map((f) => f.clave)).toEqual(["f2", "f1", "f3"]);
  });

  test("las flechas del teclado mueven una posición y dan el mismo resultado que arrastrar", () => {
    const conTeclado = moverFragmento(tres(), 2, -1);
    expect(conTeclado.map((f) => f.escenaId)).toEqual(["e1", "e3", "e2"]);
    expect(conTeclado.map((f) => f.clave)).toEqual(reordenarPorClaves(tres(), ["f1", "f3", "f2"]).map((f) => f.clave));
  });

  test("en el extremo no mueve nada: el botón de subir el primero no descoloca la lista", () => {
    expect(moverFragmento(tres(), 0, -1).map((f) => f.escenaId)).toEqual(["e1", "e2", "e3"]);
    expect(moverFragmento(tres(), 2, 1).map((f) => f.escenaId)).toEqual(["e1", "e2", "e3"]);
  });

  test("quitar y añadir no repiten ninguna clave", () => {
    const sinSegundo = quitarFragmento(tres(), "f2");
    const conNueva = anadirEscena(sinSegundo, { escenaId: "e4", duracionClip: 6 });
    const claves = conNueva.map((f) => f.clave);
    expect(new Set(claves).size).toBe(claves.length);
    expect(conNueva.at(-1)).toMatchObject({ escenaId: "e4", entrada: 0, salida: 6 });
  });

  test("una escena sin clip no entra en la línea de tiempo: no habría nada que montar", () => {
    expect(anadirEscena(tres(), { escenaId: "e4", duracionClip: null })).toHaveLength(3);
  });

  test("lo que viaja al servidor es la lista en su orden, sin las claves de la pantalla", () => {
    expect(sinClaves(tres())[0]).toEqual({ escenaId: "e1", entrada: 0, salida: 4 });
  });
});

describe("recortar con sus límites", () => {
  const fragmento = { clave: "f1", escenaId: "e1", entrada: 1, salida: 5 };

  test("la entrada no pasa de la salida menos el trozo mínimo", () => {
    const recortado = recortar(fragmento, "entrada", 9, 8);
    expect(recortado.entrada).toBe(5 - RECORTE_MINIMO_SEGUNDOS);
    expect(recortado.salida - recortado.entrada).toBeGreaterThanOrEqual(RECORTE_MINIMO_SEGUNDOS);
  });

  test("la entrada nunca es negativa", () => {
    expect(recortar(fragmento, "entrada", -3, 8).entrada).toBe(0);
  });

  test("la salida no pasa del final del clip", () => {
    expect(recortar(fragmento, "salida", 99, 8).salida).toBe(8);
  });

  test("la salida no baja de la entrada más el trozo mínimo", () => {
    expect(recortar(fragmento, "salida", 0, 8).salida).toBe(1 + RECORTE_MINIMO_SEGUNDOS);
  });

  test("sin clip medido se respeta el recorte que ya tenía en lugar de inventarse un techo", () => {
    expect(recortar(fragmento, "salida", 99, null).salida).toBe(5);
  });

  test("un valor que no es un número deja el fragmento como estaba: el campo vacío no borra el recorte", () => {
    expect(recortar(fragmento, "entrada", Number.NaN, 8)).toEqual(fragmento);
  });

  test("redondea a dos decimales: el recorte es un mando, no una medida", () => {
    expect(recortar(fragmento, "entrada", 1.23456, 8).entrada).toBe(1.23);
  });
});

describe("duración total y sus avisos", () => {
  test("suma lo que dura cada trozo recortado, no los clips enteros", () => {
    expect(duracionDelBorrador(tres())).toBe(10);
  });

  test("por debajo del minuto no dice nada: no hay nada que avisar", () => {
    expect(avisoDeDuracion(30)).toBeNull();
    expect(avisoDeDuracion(SEGUNDOS_RAZONABLES_MONTAJE)).toBeNull();
  });

  test("pasado el minuto es un consejo sobre el formato, no un problema", () => {
    const aviso = avisoDeDuracion(SEGUNDOS_RAZONABLES_MONTAJE + 1);
    expect(aviso?.tono).toBe("info");
    expect(aviso?.texto).toContain("Se puede exportar");
  });

  test("pasado el máximo es un error y dice qué hacer", () => {
    const aviso = avisoDeDuracion(SEGUNDOS_MAXIMOS_MONTAJE + 10);
    expect(aviso?.tono).toBe("error");
    expect(aviso?.texto).toContain(`${SEGUNDOS_MAXIMOS_MONTAJE} s`);
    expect(aviso?.texto).toContain("Recorta");
  });
});

describe("firma de guardado", () => {
  const borrador = (cambios: Partial<BorradorMontaje> = {}): BorradorMontaje => ({
    fragmentos: tres(),
    volumenVoz: 1,
    volumenMusica: 0.5,
    subtitulosQuemados: false,
    formatoSubtitulos: "srt",
    etiquetaVisible: true,
    etiquetaPosicion: "abajo",
    ...cambios,
  });

  test("el mismo montaje firma igual aunque se haya reordenado y devuelto a su sitio", () => {
    const ida = moverFragmento(tres(), 0, 1);
    const vuelta = moverFragmento(ida, 1, -1);
    expect(firmaDeGuardado(borrador({ fragmentos: vuelta }))).toBe(firmaDeGuardado(borrador()));
  });

  test("las claves de la pantalla no entran en la firma: no son un cambio del montaje", () => {
    const otrasClaves = tres().map((f, i) => ({ ...f, clave: `otra-${i}` }));
    expect(firmaDeGuardado(borrador({ fragmentos: otrasClaves }))).toBe(firmaDeGuardado(borrador()));
  });

  test("cambiar el orden, un recorte, un volumen o una opción sí cambia la firma", () => {
    const original = firmaDeGuardado(borrador());
    expect(firmaDeGuardado(borrador({ fragmentos: moverFragmento(tres(), 0, 1) }))).not.toBe(original);
    expect(
      firmaDeGuardado(borrador({ fragmentos: tres().map((f, i) => (i === 0 ? recortar(f, "entrada", 1, 4) : f)) })),
    ).not.toBe(original);
    expect(firmaDeGuardado(borrador({ volumenMusica: 0.6 }))).not.toBe(original);
    expect(firmaDeGuardado(borrador({ subtitulosQuemados: true }))).not.toBe(original);
    expect(firmaDeGuardado(borrador({ formatoSubtitulos: "vtt" }))).not.toBe(original);
    expect(firmaDeGuardado(borrador({ etiquetaVisible: false }))).not.toBe(original);
    expect(firmaDeGuardado(borrador({ etiquetaPosicion: "arriba" }))).not.toBe(original);
  });
});

describe("etapas del render en pantalla", () => {
  const estados = (etapa: Parameters<typeof etapasEnPantalla>[0], estado: Parameters<typeof etapasEnPantalla>[1]) =>
    etapasEnPantalla(etapa, estado).map((e) => e.estado);

  test("lo anterior a la etapa en curso está hecho y lo posterior está pendiente", () => {
    expect(estados("montando", "en_curso")).toEqual(["hecha", "hecha", "en-curso", "pendiente", "pendiente"]);
  });

  test("en cola solo marca la primera etapa, que es donde está de verdad", () => {
    expect(estados("preparando", "en_cola")).toEqual(["en-curso", "pendiente", "pendiente", "pendiente", "pendiente"]);
  });

  test("terminada deja todas hechas: no queda ninguna a medias", () => {
    expect(estados("listo", "listo")).toEqual(ETAPAS_EXPORTACION.map(() => "hecha"));
  });

  test("un fallo marca con error la etapa en la que se quedó, así que se ve dónde se rompió", () => {
    expect(estados("normalizando", "fallido")).toEqual(["hecha", "error", "pendiente", "pendiente", "pendiente"]);
  });

  test("cada etapa sale con su nombre en llano, nunca con su clave interna", () => {
    const nombres = etapasEnPantalla("montando", "en_curso").map((e) => e.nombre);
    expect(nombres).toContain("Igualando los clips");
    expect(nombres).not.toContain("normalizando");
  });
});
