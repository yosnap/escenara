import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { PrecioModelo } from "../proveedores/contrato";
import type { EntradaResuelta } from "./mapa";

/**
 * **Nunca se cobra por encima de lo confirmado.** Pedir un texto con un techo por llamada solo prueba las entradas
 * del mapa que caben en él: las de cuota del plan siempre, y las de pago si su precio vigente no lo pasa y es del
 * mismo proveedor cuyos créditos se confirmaron. Las demás no se llaman ni reservan nada, y el error lo dice.
 *
 * Sin base de datos ni proveedores: el mapa, el catálogo, los adaptadores y el apunte del gasto son dobles que
 * registran a quién se llamó y qué se reservó.
 */

const cuota: EntradaResuelta = {
  proveedor: "compatible",
  compatibleId: "c1",
  modelo: "gemma4",
  nombreProveedor: "NaN builders",
  clave: "clave-nan",
  compatible: {
    id: "c1",
    nombre: "NaN builders",
    urlBase: "https://nan.example",
    clave: "clave-nan",
    modelos: ["gemma4"],
  },
};
const dePago = (modelo: string, proveedor = "kie", nombreProveedor = "KIE.ai"): EntradaResuelta =>
  // `proveedor` es un `Proveedor` del registro; los dobles aceptan cualquiera para probar uno ajeno.
  ({ proveedor, compatibleId: null, modelo, nombreProveedor, clave: "clave-kie", compatible: null }) as EntradaResuelta;

let mapa: EntradaResuelta[] = [];
/** Precio de cada modelo de pago; una lista da un precio distinto en cada consulta (el último se repite). */
let precios: Record<string, number | number[]> = {};
let falloCuota: Error | null = null;
const llamadas: string[] = [];
const reservas: { modelo: string; creditos: number }[] = [];

const precioDe = (modelo: string): number => {
  const precio = precios[modelo];
  if (precio === undefined) throw new Error(`sin precio para ${modelo}`);
  if (typeof precio === "number") return precio;
  return precio.length > 1 ? (precio.shift() as number) : (precio[0] as number);
};

const reales = {
  mapa: await import("./mapa"),
  catalogo: await import("../proveedores/catalogo"),
  registro: await import("../proveedores/registro"),
  gasto: await import("../asistente/gasto"),
  cliente: await import("../proveedores/compatible/cliente"),
  compatibles: await import("../boveda/compatibles"),
  db: await import("../db/cliente"),
};

mock.module("./mapa", () => ({ ...reales.mapa, resolverMapa: async () => mapa }));
mock.module("../proveedores/catalogo", () => ({
  ...reales.catalogo,
  elegirModelo: async (_capacidad: string, modelo: string) => {
    const entrada = mapa.find((e) => e.modelo === modelo);
    return {
      proveedor: entrada?.proveedor ?? "kie",
      modelo,
      nombre: modelo,
      nombreProveedor: entrada?.nombreProveedor,
    };
  },
}));
mock.module("../proveedores/registro", () => ({
  ...reales.registro,
  adaptadorDe: (proveedor: string) => ({
    estimar: async (modelo: string): Promise<PrecioModelo> => ({
      proveedor,
      modelo,
      unidad: "llamada",
      creditos: precioDe(modelo),
      fuente: "prueba",
      comprobado: "2026-10-19",
      sello: `${proveedor}:${modelo}@v1`,
    }),
    generarTexto: async ({ modelo }: { modelo: string }) => {
      llamadas.push(modelo);
      return { texto: `escrito por ${modelo}`, creditos: null };
    },
  }),
}));
mock.module("../asistente/gasto", () => ({
  ...reales.gasto,
  reservarEjecucion: async (datos: { modelo: string; creditos: number }) => {
    reservas.push({ modelo: datos.modelo, creditos: datos.creditos });
    return { ejecucion: { id: `ejecucion-${reservas.length}` }, nueva: true };
  },
  cerrarGastoDeEjecucion: async () => undefined,
}));
mock.module("../proveedores/compatible/cliente", () => ({
  ...reales.cliente,
  pedirChat: async ({ modelo }: { modelo: string }) => {
    llamadas.push(modelo);
    if (falloCuota) throw falloCuota;
    return { texto: `escrito por ${modelo}`, tokensEntrada: 1, tokensSalida: 1 };
  },
}));
mock.module("../boveda/compatibles", () => ({
  ...reales.compatibles,
  invalidarSiLaClaveNoSirve: async () => undefined,
}));
// El apunte por cuota no puede tirar el trabajo: aquí no hay base de datos y se ignora.
mock.module("../db/cliente", () => ({ ...reales.db, db: () => ({ transaction: async () => undefined }) }));

const { ErrorCompatible } = reales.cliente;
const {
  cabeEnElTecho,
  ErrorDeTexto,
  ErrorSobreLoConfirmado,
  estimarTextoConReserva,
  estimarTextoPorMapa,
  pedirTextoPorMapa,
} = await import("./texto");

type Techo = { creditos: number; proveedor: string };

const pedir = (techo?: Techo, techoReserva?: Techo) =>
  pedirTextoPorMapa({
    usuarioId: "usuario-1",
    kind: "guion",
    instrucciones: "Escribe.",
    entrada: "Una idea.",
    claveIdempotencia: `clave-${crypto.randomUUID()}`,
    ...(techo ? { techoPorLlamada: techo } : {}),
    ...(techoReserva ? { techoReserva } : {}),
  });

beforeEach(() => {
  mapa = [];
  precios = {};
  falloCuota = null;
  llamadas.length = 0;
  reservas.length = 0;
});

describe("estimación por el mapa", () => {
  test("con la principal de cuota, 0 créditos por cuota y sin sello", async () => {
    mapa = [cuota, dePago("barato")];
    precios = { barato: 2 };
    const estimacion = await estimarTextoPorMapa("usuario-1");
    expect(estimacion).toMatchObject({ hayEntradas: true, creditos: 0, porCuota: true, sello: "", comprobado: "" });
    expect(estimacion.nombreProveedor).toBe("NaN builders");
  });

  test("con la principal de pago, su precio redondeado, su sello y su proveedor", async () => {
    mapa = [dePago("caro"), cuota];
    precios = { caro: 4.5 };
    expect(await estimarTextoPorMapa("usuario-1")).toMatchObject({
      creditos: 5,
      porCuota: false,
      sello: "kie:caro@v1",
      comprobado: "2026-10-19",
      proveedor: "kie",
    });
  });

  test("sin entradas, no hay estimación y se dice qué falta", async () => {
    const estimacion = await estimarTextoPorMapa("usuario-1");
    expect(estimacion.hayEntradas).toBe(false);
    expect(estimacion.motivo).toContain("mapa de modelos de texto");
  });
});

describe("pedir texto con un techo por llamada", () => {
  test("confirmado por cuota y sin reserva: si la principal falla, la de pago no se llama ni reserva nada", async () => {
    mapa = [cuota, dePago("barato")];
    precios = { barato: 2 };
    falloCuota = new ErrorCompatible("tiempo-agotado");
    const error = await pedir({ creditos: 0, proveedor: "compatible" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorDeTexto);
    expect(llamadas).toEqual(["gemma4"]);
    expect(reservas).toEqual([]);
    const mensaje = (error as InstanceType<typeof ErrorDeTexto>).mensaje("No se ha podido escribir el guion");
    expect(mensaje).toContain("NaN builders ha tardado demasiado");
    expect(mensaje).toContain(
      "la entrada de KIE.ai (2 créditos por llamada, y lo confirmado no dejaba créditos para ella)",
    );
    expect(mensaje).not.toContain("barato");
  });

  test("confirmado por cuota y la principal responde: se escribe y no se reserva nada", async () => {
    mapa = [cuota, dePago("barato")];
    precios = { barato: 2 };
    const resultado = await pedir({ creditos: 0, proveedor: "compatible" });
    expect(resultado.texto).toBe("escrito por gemma4");
    expect(resultado.creditos).toBe(0);
    expect(reservas).toEqual([]);
  });

  test("una principal de pago más cara que lo confirmado no se llama; una reserva que cabe, sí", async () => {
    mapa = [dePago("caro"), dePago("barato")];
    precios = { caro: 5, barato: 2 };
    const resultado = await pedir({ creditos: 2, proveedor: "kie" });
    expect(llamadas).toEqual(["barato"]);
    expect(reservas).toEqual([{ modelo: "barato", creditos: 2 }]);
    expect(resultado.modelo).toBe("barato");
  });

  test("una principal de pago cuyo precio es lo confirmado se llama y reserva exactamente eso", async () => {
    mapa = [dePago("caro"), cuota];
    precios = { caro: 5 };
    await pedir({ creditos: 5, proveedor: "kie" });
    expect(llamadas).toEqual(["caro"]);
    expect(reservas).toEqual([{ modelo: "caro", creditos: 5 }]);
  });

  test("nada cabe en lo confirmado: no se llama a nadie y el mensaje lo dice sin hablar de averías", async () => {
    mapa = [dePago("caro")];
    precios = { caro: 5 };
    const error = await pedir({ creditos: 2, proveedor: "kie" }).catch((e: unknown) => e);
    expect(llamadas).toEqual([]);
    expect(reservas).toEqual([]);
    const mensaje = (error as InstanceType<typeof ErrorDeTexto>).mensaje("No se ha podido escribir el guion");
    expect(mensaje).toContain(
      "No se ha probado la entrada de KIE.ai (5 créditos por llamada, y lo confirmado solo dejaba 2 créditos)",
    );
    expect(mensaje).not.toContain("mapa de modelos de texto no tiene ninguna entrada");
    // No se ha enviado nada a nadie: 409, no 502, para que nadie piense que pudo quedar algo encargado.
    expect((error as InstanceType<typeof ErrorDeTexto>).estado).toBe(409);
  });

  test("una entrada de pago de otro proveedor no se compara con créditos ajenos: no se prueba", async () => {
    mapa = [dePago("caro"), dePago("ajeno", "otro", "Otro")];
    precios = { caro: 5, ajeno: 1 };
    const error = await pedir({ creditos: 2, proveedor: "kie" }).catch((e: unknown) => e);
    expect(llamadas).toEqual([]);
    expect((error as InstanceType<typeof ErrorDeTexto>).sinConfirmar).toEqual(["la entrada de Otro"]);
  });

  test("si el precio sube entre acotar el mapa y reservar, no se reserva ni se llama", async () => {
    mapa = [dePago("caro")];
    precios = { caro: [2, 3] };
    const error = await pedir({ creditos: 2, proveedor: "kie" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorSobreLoConfirmado);
    expect((error as Error).message).toContain(
      "cobraría ahora 3 créditos por llamada y lo que confirmaste solo deja 2 créditos",
    );
    expect(llamadas).toEqual([]);
    expect(reservas).toEqual([]);
  });

  test("sin techo, como siempre: la principal y las de cuota, nunca otra de pago", async () => {
    mapa = [cuota, dePago("barato")];
    precios = { barato: 2 };
    falloCuota = new ErrorCompatible("tiempo-agotado");
    const error = await pedir().catch((e: unknown) => e);
    expect(llamadas).toEqual(["gemma4"]);
    expect((error as InstanceType<typeof ErrorDeTexto>).sinConfirmar).toEqual(["la entrada de KIE.ai"]);
  });
});

describe("reserva de pago detrás de una principal de cuota", () => {
  test("si la principal se satura, escribe la reserva de pago que cabe en lo que queda, y se avisa", async () => {
    mapa = [cuota, dePago("barato")];
    precios = { barato: 2 };
    falloCuota = new ErrorCompatible("limite");
    const resultado = await pedir({ creditos: 0, proveedor: "compatible" }, { creditos: 2, proveedor: "kie" });
    expect(llamadas).toEqual(["gemma4", "barato"]);
    expect(reservas).toEqual([{ modelo: "barato", creditos: 2 }]);
    expect(resultado.deReserva).toBe(true);
    expect(resultado.aviso).toContain("reserva de pago de KIE.ai");
    expect(resultado.aviso).not.toContain("barato");
  });

  test("una reserva de pago que ya no cabe en lo que queda no se llama, y se dice cuánto quedaba", async () => {
    mapa = [cuota, dePago("barato")];
    precios = { barato: 2 };
    falloCuota = new ErrorCompatible("limite");
    const error = await pedir({ creditos: 0, proveedor: "compatible" }, { creditos: 1, proveedor: "kie" }).catch(
      (e: unknown) => e,
    );
    expect(llamadas).toEqual(["gemma4"]);
    expect(reservas).toEqual([]);
    const mensaje = (error as InstanceType<typeof ErrorDeTexto>).mensaje("No se ha podido escribir el guion");
    expect(mensaje).toContain("(2 créditos por llamada, y lo confirmado solo dejaba 1 crédito)");
    // Sí se envió algo (a NaN), aunque no cobrara: es un fallo de proveedor, 502.
    expect((error as InstanceType<typeof ErrorDeTexto>).estado).toBe(502);
    expect(mensaje).toContain("tampoco se ha cobrado nada");
  });

  test("el techo de reserva no vale para la principal: una principal más cara que su techo no se llama", async () => {
    mapa = [dePago("caro"), dePago("barato")];
    precios = { caro: 5, barato: 2 };
    await pedir({ creditos: 2, proveedor: "kie" }, { creditos: 10, proveedor: "kie" });
    expect(llamadas).toEqual(["barato"]);
  });
});

describe("estimación de la reserva de pago", () => {
  test("es la entrada de pago más cara detrás de la principal, y su sello reúne los de todas", async () => {
    mapa = [cuota, dePago("barato"), dePago("caro")];
    precios = { barato: 2, caro: 4.5 };
    const { estimacion, reserva } = await estimarTextoConReserva("usuario-1");
    expect(estimacion.porCuota).toBe(true);
    expect(reserva).toMatchObject({ creditos: 5, proveedor: "kie", nombreProveedor: "KIE.ai" });
    expect(reserva?.sello).toBe("kie:barato@v1+kie:caro@v1");
  });

  test("sin entradas de pago no hay reserva", async () => {
    mapa = [cuota];
    expect((await estimarTextoConReserva("usuario-1")).reserva).toBeNull();
  });

  test("con la principal de pago, las de otro proveedor no cuentan: sus créditos no se suman", async () => {
    mapa = [dePago("caro"), dePago("ajeno", "otro", "Otro")];
    precios = { caro: 5, ajeno: 9 };
    const { estimacion, reserva } = await estimarTextoConReserva("usuario-1");
    expect(estimacion.creditos).toBe(5);
    expect(reserva).toBeNull();
  });
});

describe("cabeEnElTecho", () => {
  test("los créditos de un proveedor no se comparan con los de otro, salvo un techo de 0", () => {
    expect(cabeEnElTecho({ creditos: 2, proveedor: "kie" }, "kie", 2)).toBe(true);
    expect(cabeEnElTecho({ creditos: 2, proveedor: "kie" }, "kie", 3)).toBe(false);
    expect(cabeEnElTecho({ creditos: 2, proveedor: "kie" }, "otro", 1)).toBe(false);
    expect(cabeEnElTecho({ creditos: 0, proveedor: "compatible" }, "kie", 1)).toBe(false);
  });
});
