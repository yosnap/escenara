import { beforeAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

/**
 * **Estrategia del anuncio** (0.27.0) contra el PostgreSQL local: el catálogo de ángulos, la oferta, el brief y la
 * puerta de la declaración de veracidad.
 *
 * Lo que comprueba, de punta a punta:
 *
 * - **un solo ángulo**: el brief guarda uno del catálogo, una lista se rechaza diciendo por qué y uno inventado
 *   también;
 * - un proyecto **sin brief** sigue igual que antes de esta versión, y su puerta del guion deja pasar;
 * - **autorización**: nadie lee ni usa ofertas ni briefs ajenos, y una oferta no se puede atar a un producto de
 *   otra persona ni usarse en un brief de otro producto;
 * - **duplicar una oferta** a otro producto copia sus campos y no toca la original;
 * - los campos opcionales vacíos se guardan como **nulos** y vaciarlos después los borra;
 * - la **puerta de la declaración** bloquea en los cuatro ángulos que afirman algo comprobable, con un mensaje que
 *   dice qué falta, y no bloquea en los demás;
 * - `projects.angle_preset_key` queda **sincronizado** con el brief;
 * - el **interruptor del admin** apagado deja de aceptar cambios con su motivo, pero sigue dejando leer lo escrito.
 *
 * **Ningún test llama a ningún proveedor**: esta versión no gasta un crédito, y aquí no se genera nada.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_anuncio");
}

const { eq } = await import("drizzle-orm");
const rutaOfertas = await import("@/app/api/ofertas/route");
const rutaOferta = await import("@/app/api/ofertas/[id]/route");
const rutaDuplicar = await import("@/app/api/ofertas/[id]/duplicar/route");
const rutaBrief = await import("@/app/api/proyectos/[id]/brief/route");
const rutaDeclaracion = await import("@/app/api/proyectos/[id]/brief/declaracion/route");
const { guardarAjustes } = await import("../ajustes");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { offers, projects, sensitiveClaimDeclarations } = await import("../db/esquema");
const { crearProyecto } = await import("../asistente/proyectos");
const { crearProducto } = await import("../productos/servicio");
const { listarAngulos } = await import("./catalogo");
const { puedePedirGuion } = await import("./puerta-guion");
const { guardarBrief, obtenerBrief } = await import("./brief");
const { duplicarOferta } = await import("./ofertas");
const { ANGULOS_CON_DECLARACION_DE_FABRICA, TEXTO_DECLARACION_VERACIDAD } = await import("@/lib/anuncio");

type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;
type Actor = import("../media/servicio").Actor;
type OfertaVista = import("@/lib/anuncio").OfertaVista;
type BriefVista = import("@/lib/anuncio").BriefVista;

const pedir = (s: Sesion, url: string, metodo: string, cuerpo?: unknown) =>
  new Request(`http://localhost${url}`, {
    method: metodo,
    headers: { cookie: s.cookie, origin: "http://localhost", "Content-Type": "application/json" },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });

const contexto = (id: string) => ({ params: Promise.resolve({ id }) });

const sufijo = () => randomBytes(3).toString("hex");

describe.skipIf(!hayBaseDeDatos)("estrategia del anuncio: ángulo, oferta y brief", () => {
  let ana: Sesion;
  let beto: Sesion;
  let actorAna: Actor;
  let actorBeto: Actor;

  beforeAll(async () => {
    await aplicarMigraciones();
    [ana, beto] = await Promise.all([crearSesionDePrueba("user"), crearSesionDePrueba("user")]);
    actorAna = { id: ana.id, esAdmin: false };
    actorBeto = { id: beto.id, esAdmin: false };
  });

  const productoDe = async (actor: Actor, nombre: string) =>
    crearProducto(actor, { nombre: `${nombre} ${sufijo()}`, descripcion: "Bote blanco.", tipo: "fisico" });

  /** Proyecto nuevo, del que solo hace falta su identificador. */
  async function proyectoDe(actor: Actor, titulo: string): Promise<{ id: string }> {
    const detalle = await crearProyecto(actor, {
      titulo: `${titulo} ${sufijo()}`,
      formato: "anuncio",
      idea: "Anuncio de champú.",
    });
    return { id: detalle.proyecto.id };
  }

  /** Crea una oferta por la ruta HTTP, que es el camino de la pantalla. */
  async function ofertaDe(sesion: Sesion, productoId: string, extra: Record<string, unknown> = {}) {
    const respuesta = await rutaOfertas.POST(
      pedir(sesion, "/api/ofertas", "POST", { productoId, queSeDa: "Un bote de 300 ml que dura un mes.", ...extra }),
      undefined,
    );
    expect(respuesta.status).toBe(201);
    return (await respuesta.json()) as OfertaVista;
  }

  // ── 1. El catálogo de los doce ─────────────────────────────────────────────────────────────────────────

  describe("el catálogo de ángulos", () => {
    test("la semilla deja los doce activos, con su definición y su ejemplo", async () => {
      const angulos = await listarAngulos();
      expect(angulos).toHaveLength(12);
      const mecanismo = angulos.find((a) => a.clave === "mecanismo");
      expect(mecanismo?.nombre).toBe("Mecanismo");
      expect(mecanismo?.porDondeEntra).toBe("El porqué, la causa oculta");
      expect(mecanismo?.ejemplo.length).toBeGreaterThan(10);
      expect(mecanismo?.exigeDeclaracion).toBe(true);
      expect(angulos.find((a) => a.clave === "comodidad")?.exigeDeclaracion).toBe(false);
    });

    test("los ángulos no se duplican: el catálogo lo amplía quien administra", async () => {
      const { presets } = await import("../db/esquema");
      const [fila] = await db().select().from(presets).where(eq(presets.slug, "mecanismo")).limit(1);
      const { duplicarPreset } = await import("../prompts/presets-admin");
      expect(fila).toBeDefined();
      const fallo = await duplicarPreset(ana.id, fila?.id ?? "").catch((e: Error) => e);
      expect((fallo as Error).message).toContain("no se duplican");
    });
  });

  // ── 2. La oferta ───────────────────────────────────────────────────────────────────────────────────────

  describe("la oferta, atada al producto", () => {
    test("los campos opcionales vacíos se guardan como nulos y no aparecen", async () => {
      const producto = await productoDe(actorAna, "Champú");
      const oferta = await ofertaDe(ana, producto.id, { precio: "19,90 €", garantia: "", urgencia: "   " });
      expect(oferta.precio).toBe("19,90 €");
      expect(oferta.garantia).toBe("");
      const [fila] = await db().select().from(offers).where(eq(offers.id, oferta.id)).limit(1);
      // Nulos de verdad en la base: «no hay garantía» y «la garantía es el texto vacío» no pueden confundirse.
      expect(fila?.guarantee).toBeNull();
      expect(fila?.urgency).toBeNull();
      expect(fila?.bonus).toBeNull();
      expect(fila?.price).toBe("19,90 €");
    });

    test("sin «qué se da» no hay oferta, y el mensaje dice que es el único obligatorio", async () => {
      const producto = await productoDe(actorAna, "Sin qué se da");
      const respuesta = await rutaOfertas.POST(
        pedir(ana, "/api/ofertas", "POST", { productoId: producto.id, queSeDa: "   " }),
        undefined,
      );
      expect(respuesta.status).toBe(400);
      expect((await respuesta.json()).error).toContain("qué se le da");
    });

    test("vaciar un campo después lo borra y deja de aparecer en el guion", async () => {
      const producto = await productoDe(actorAna, "Editable");
      const oferta = await ofertaDe(ana, producto.id, { garantia: "30 días" });
      const respuesta = await rutaOferta.PATCH(
        pedir(ana, `/api/ofertas/${oferta.id}`, "PATCH", { garantia: "" }),
        contexto(oferta.id),
      );
      expect(respuesta.status).toBe(200);
      expect(((await respuesta.json()) as OfertaVista).garantia).toBe("");
      const [fila] = await db().select().from(offers).where(eq(offers.id, oferta.id)).limit(1);
      expect(fila?.guarantee).toBeNull();
    });

    test("una oferta ajena no se lee, no se edita y no se borra: 404 y sin decir que existe", async () => {
      const producto = await productoDe(actorAna, "De Ana");
      const oferta = await ofertaDe(ana, producto.id);
      for (const [ruta, metodo] of [
        [rutaOferta.GET, "GET"],
        [rutaOferta.PATCH, "PATCH"],
        [rutaOferta.DELETE, "DELETE"],
      ] as const) {
        const respuesta = await ruta(
          pedir(beto, `/api/ofertas/${oferta.id}`, metodo, metodo === "GET" ? undefined : { queSeDa: "mío" }),
          contexto(oferta.id),
        );
        expect(respuesta.status).toBe(404);
        expect((await respuesta.json()).error).toBe("Esa oferta no existe.");
      }
    });

    test("una oferta no se puede atar a un producto ajeno", async () => {
      const deBeto = await productoDe(actorBeto, "De Beto");
      const respuesta = await rutaOfertas.POST(
        pedir(ana, "/api/ofertas", "POST", { productoId: deBeto.id, queSeDa: "Lo suyo." }),
        undefined,
      );
      expect(respuesta.status).toBe(404);
      expect((await respuesta.json()).error).toBe("Ese producto no existe.");
    });

    test("listar solo devuelve las propias, y por producto ajeno responde 404", async () => {
      const producto = await productoDe(actorAna, "Listado");
      const mia = await ofertaDe(ana, producto.id);
      const deBeto = await productoDe(actorBeto, "Listado de Beto");
      await ofertaDe(beto, deBeto.id);

      const respuesta = await rutaOfertas.GET(pedir(ana, "/api/ofertas", "GET"), undefined);
      const lista = (await respuesta.json()) as OfertaVista[];
      expect(lista.some((o) => o.id === mia.id)).toBe(true);
      expect(lista.every((o) => o.productoId !== deBeto.id)).toBe(true);
      expect(lista.find((o) => o.id === mia.id)?.productoNombre).toBe(producto.nombre);

      const ajena = await rutaOfertas.GET(pedir(ana, `/api/ofertas?productoId=${deBeto.id}`, "GET"), undefined);
      expect(ajena.status).toBe(404);
    });

    test("borrar es lógico: deja de listarse y el brief que la citaba se queda sin ella", async () => {
      const producto = await productoDe(actorAna, "Borrable");
      const oferta = await ofertaDe(ana, producto.id);
      const proyecto = await proyectoDe(actorAna, "Con oferta borrada");
      await guardarBrief(actorAna, proyecto.id, { productoId: producto.id, ofertaId: oferta.id, angulo: "identidad" });

      const respuesta = await rutaOferta.DELETE(pedir(ana, `/api/ofertas/${oferta.id}`, "DELETE"), contexto(oferta.id));
      expect(respuesta.status).toBe(200);
      const lista = (await (
        await rutaOfertas.GET(pedir(ana, "/api/ofertas", "GET"), undefined)
      ).json()) as OfertaVista[];
      expect(lista.some((o) => o.id === oferta.id)).toBe(false);
      // La fila sigue existiendo: el guion que salió de ella ya se escribió.
      const [fila] = await db().select().from(offers).where(eq(offers.id, oferta.id)).limit(1);
      expect(fila?.deletedAt).not.toBeNull();
      const brief = await obtenerBrief(actorAna, proyecto.id);
      expect(brief?.oferta).toBeNull();
      // Y sin «qué se da» vigente, la puerta del guion vuelve a pedirlo con su motivo.
      const puerta = await puedePedirGuion(proyecto.id);
      expect(puerta.puede).toBe(false);
      expect(puerta.motivo).toContain("una oferta con qué se le da");
    });
  });

  // ── 3. Duplicar la oferta a otro producto ──────────────────────────────────────────────────────────────

  describe("duplicar una oferta", () => {
    test("copia sus campos al otro producto y no toca la original", async () => {
      const origen = await productoDe(actorAna, "Origen");
      const destino = await productoDe(actorAna, "Destino");
      const oferta = await ofertaDe(ana, origen.id, { precio: "19,90 €", bonus: "Con el cepillo incluido" });

      const respuesta = await rutaDuplicar.POST(
        pedir(ana, `/api/ofertas/${oferta.id}/duplicar`, "POST", { productoId: destino.id }),
        contexto(oferta.id),
      );
      expect(respuesta.status).toBe(201);
      const copia = (await respuesta.json()) as OfertaVista;
      expect(copia.id).not.toBe(oferta.id);
      expect(copia.productoId).toBe(destino.id);
      expect(copia.queSeDa).toBe(oferta.queSeDa);
      expect(copia.precio).toBe("19,90 €");
      expect(copia.bonus).toBe("Con el cepillo incluido");
      // La original sigue igual y en su producto.
      const [fila] = await db().select().from(offers).where(eq(offers.id, oferta.id)).limit(1);
      expect(fila?.productId).toBe(origen.id);
      expect(fila?.deletedAt).toBeNull();
    });

    test("no se duplica al mismo producto ni a uno ajeno", async () => {
      const producto = await productoDe(actorAna, "Mismo");
      const oferta = await ofertaDe(ana, producto.id);
      const mismo = await duplicarOferta(actorAna, oferta.id, producto.id).catch((e: Error) => e);
      expect((mismo as Error).message).toContain("ya es de");
      const deBeto = await productoDe(actorBeto, "Ajeno destino");
      const ajeno = await duplicarOferta(actorAna, oferta.id, deBeto.id).catch((e: Error) => e);
      expect((ajeno as Error).message).toBe("Ese producto no existe.");
    });
  });

  // ── 4. El brief: un solo ángulo ────────────────────────────────────────────────────────────────────────

  describe("el brief del anuncio", () => {
    test("guarda un ángulo, lo sincroniza en el proyecto y lo devuelve resuelto", async () => {
      const producto = await productoDe(actorAna, "Brief");
      const oferta = await ofertaDe(ana, producto.id);
      const proyecto = await proyectoDe(actorAna, "Anuncio");

      const respuesta = await rutaBrief.PUT(
        pedir(ana, `/api/proyectos/${proyecto.id}/brief`, "PUT", {
          productoId: producto.id,
          ofertaId: oferta.id,
          angulo: "identidad",
          publico: "Quien tiene el pelo rizado y ya lo ha probado todo",
          versionMejor: "Salir de casa sin pensar en el pelo",
        }),
        contexto(proyecto.id),
      );
      expect(respuesta.status).toBe(200);
      const { brief, puerta } = (await respuesta.json()) as { brief: BriefVista; puerta: { puede: boolean } };
      expect(brief.angulo).toBe("identidad");
      expect(brief.anguloVista?.nombre).toBe("Identidad");
      expect(brief.oferta?.id).toBe(oferta.id);
      expect(puerta.puede).toBe(true);

      // La copia denormalizada del proyecto queda con el mismo ángulo: es con la que se comparan campañas.
      const [fila] = await db().select().from(projects).where(eq(projects.id, proyecto.id)).limit(1);
      expect(fila?.anglePresetKey).toBe("identidad");
    });

    test("dos ángulos a la vez es imposible: una lista se rechaza diciendo por qué", async () => {
      const proyecto = await proyectoDe(actorAna, "Dos ángulos");
      const respuesta = await rutaBrief.PUT(
        pedir(ana, `/api/proyectos/${proyecto.id}/brief`, "PUT", { angulo: ["identidad", "mecanismo"] }),
        contexto(proyecto.id),
      );
      expect(respuesta.status).toBe(400);
      expect((await respuesta.json()).error).toContain("un solo ángulo");
    });

    test("un ángulo que no está en el catálogo se rechaza", async () => {
      const proyecto = await proyectoDe(actorAna, "Ángulo inventado");
      const respuesta = await rutaBrief.PUT(
        pedir(ana, `/api/proyectos/${proyecto.id}/brief`, "PUT", { angulo: "el-que-me-acabo-de-inventar" }),
        contexto(proyecto.id),
      );
      expect(respuesta.status).toBe(400);
      expect((await respuesta.json()).error).toContain("no está en el catálogo");
    });

    test("una oferta de otro producto no vale en este brief, y se dice qué hacer", async () => {
      const uno = await productoDe(actorAna, "Producto uno");
      const otro = await productoDe(actorAna, "Producto dos");
      const ofertaDeOtro = await ofertaDe(ana, otro.id);
      const proyecto = await proyectoDe(actorAna, "Oferta cruzada");
      const respuesta = await rutaBrief.PUT(
        pedir(ana, `/api/proyectos/${proyecto.id}/brief`, "PUT", {
          productoId: uno.id,
          ofertaId: ofertaDeOtro.id,
          angulo: "identidad",
        }),
        contexto(proyecto.id),
      );
      expect(respuesta.status).toBe(409);
      expect((await respuesta.json()).error).toContain("es de otro producto");
    });

    test("el brief de un proyecto ajeno no se lee ni se escribe: 404", async () => {
      const proyecto = await proyectoDe(actorAna, "Privado");
      await guardarBrief(actorAna, proyecto.id, { angulo: "identidad", publico: "El suyo" });
      const leer = await rutaBrief.GET(
        pedir(beto, `/api/proyectos/${proyecto.id}/brief`, "GET"),
        contexto(proyecto.id),
      );
      expect(leer.status).toBe(404);
      const escribir = await rutaBrief.PUT(
        pedir(beto, `/api/proyectos/${proyecto.id}/brief`, "PUT", { publico: "Mío ahora" }),
        contexto(proyecto.id),
      );
      expect(escribir.status).toBe(404);
      // Y no ha cambiado nada de lo de Ana.
      expect((await obtenerBrief(actorAna, proyecto.id))?.publico).toBe("El suyo");
    });

    test("una oferta ajena no se puede meter en un brief propio", async () => {
      const deBeto = await productoDe(actorBeto, "Producto de Beto");
      const suya = await ofertaDe(beto, deBeto.id);
      const proyecto = await proyectoDe(actorAna, "Oferta ajena");
      const respuesta = await rutaBrief.PUT(
        pedir(ana, `/api/proyectos/${proyecto.id}/brief`, "PUT", { ofertaId: suya.id }),
        contexto(proyecto.id),
      );
      expect(respuesta.status).toBe(404);
      expect((await respuesta.json()).error).toBe("Esa oferta no existe.");
    });

    test("un proyecto sin brief sigue como antes de esta versión y puede pedir guion", async () => {
      const proyecto = await proyectoDe(actorAna, "Sin brief");
      expect(await obtenerBrief(actorAna, proyecto.id)).toBeNull();
      const puerta = await puedePedirGuion(proyecto.id);
      expect(puerta.puede).toBe(true);
      expect(puerta.motivo).toBe("");
      const respuesta = await rutaBrief.GET(
        pedir(ana, `/api/proyectos/${proyecto.id}/brief`, "GET"),
        contexto(proyecto.id),
      );
      expect(respuesta.status).toBe(200);
      const cuerpo = (await respuesta.json()) as { brief: null; activo: boolean; angulos: unknown[] };
      expect(cuerpo.brief).toBeNull();
      // El brief viene encendido de fábrica y el catálogo llega con la pantalla.
      expect(cuerpo.activo).toBe(true);
      expect(cuerpo.angulos).toHaveLength(12);
    });

    test("un brief a medias no puede pedir guion, y el motivo nombra lo que falta", async () => {
      const proyecto = await proyectoDe(actorAna, "A medias");
      await guardarBrief(actorAna, proyecto.id, { publico: "Quien tiene el pelo rizado" });
      const puerta = await puedePedirGuion(proyecto.id);
      expect(puerta.puede).toBe(false);
      expect(puerta.motivo).toContain("de qué producto es el anuncio");
      expect(puerta.motivo).toContain("el ángulo");
      expect(puerta.motivo).toContain("una oferta con qué se le da");
    });
  });

  // ── 5. La puerta de la declaración de veracidad ────────────────────────────────────────────────────────

  describe("la declaración de veracidad", () => {
    /** Brief completo con el ángulo pedido: producto, oferta con «qué se da» y el ángulo. */
    async function briefCon(angulo: string) {
      const producto = await productoDe(actorAna, `Para ${angulo}`);
      const oferta = await ofertaDe(ana, producto.id);
      const proyecto = await proyectoDe(actorAna, `Anuncio ${angulo}`);
      await guardarBrief(actorAna, proyecto.id, { productoId: producto.id, ofertaId: oferta.id, angulo });
      return proyecto;
    }

    test.each([...ANGULOS_CON_DECLARACION_DE_FABRICA])(
      "el ángulo «%s» no pide guion sin declaración, y el mensaje dice qué falta",
      async (angulo) => {
        const proyecto = await briefCon(angulo);
        const puerta = await puedePedirGuion(proyecto.id);
        expect(puerta.puede).toBe(false);
        expect(puerta.faltaDeclaracion).toBe(true);
        expect(puerta.motivo).toContain("la declaración del ángulo");

        const respuesta = await rutaDeclaracion.POST(
          pedir(ana, `/api/proyectos/${proyecto.id}/brief/declaracion`, "POST", { angulo, aceptado: true }),
          contexto(proyecto.id),
        );
        expect(respuesta.status).toBe(201);
        const cuerpo = (await respuesta.json()) as {
          declaracion: { textoAceptado: string };
          puerta: { puede: boolean };
        };
        // El texto se guarda entero: es lo que hay que poder demostrar, no que pulsó una casilla.
        expect(cuerpo.declaracion.textoAceptado).toBe(TEXTO_DECLARACION_VERACIDAD);
        expect(cuerpo.puerta.puede).toBe(true);
      },
    );

    test.each(["problema-dolor", "identidad", "objeciones", "emocional", "estatus", "comodidad", "rompemitos"])(
      "el ángulo «%s» no exige ninguna declaración y pide guion directamente",
      async (angulo) => {
        const proyecto = await briefCon(angulo);
        const puerta = await puedePedirGuion(proyecto.id);
        expect(puerta.puede).toBe(true);
        expect(puerta.faltaDeclaracion).toBe(false);
      },
    );

    test("cambiar a otro ángulo que también la exige vuelve a pedirla: se afirma otra cosa", async () => {
      const proyecto = await briefCon("mecanismo");
      await rutaDeclaracion.POST(
        pedir(ana, `/api/proyectos/${proyecto.id}/brief/declaracion`, "POST", {
          angulo: "mecanismo",
          aceptado: true,
        }),
        contexto(proyecto.id),
      );
      expect((await puedePedirGuion(proyecto.id)).puede).toBe(true);

      await guardarBrief(actorAna, proyecto.id, { angulo: "comparacion" });
      const puerta = await puedePedirGuion(proyecto.id);
      expect(puerta.puede).toBe(false);
      expect(puerta.faltaDeclaracion).toBe(true);
    });

    test("sin aceptar expresamente no se registra, y aceptarla dos veces no crea dos filas", async () => {
      const proyecto = await briefCon("beneficio");
      const sinAceptar = await rutaDeclaracion.POST(
        pedir(ana, `/api/proyectos/${proyecto.id}/brief/declaracion`, "POST", {
          angulo: "beneficio",
          aceptado: false,
        }),
        contexto(proyecto.id),
      );
      expect(sinAceptar.status).toBe(400);
      expect((await sinAceptar.json()).error).toContain("aceptar la declaración");

      for (const _ of [1, 2]) {
        const respuesta = await rutaDeclaracion.POST(
          pedir(ana, `/api/proyectos/${proyecto.id}/brief/declaracion`, "POST", {
            angulo: "beneficio",
            aceptado: true,
          }),
          contexto(proyecto.id),
        );
        expect(respuesta.status).toBe(201);
      }
      const filas = await db()
        .select()
        .from(sensitiveClaimDeclarations)
        .where(eq(sensitiveClaimDeclarations.projectId, proyecto.id));
      expect(filas).toHaveLength(1);
      expect(filas[0]?.acceptedBy).toBe(ana.id);
    });

    test("declararla en un ángulo que no la pide se rechaza con su motivo", async () => {
      const proyecto = await briefCon("comodidad");
      const respuesta = await rutaDeclaracion.POST(
        pedir(ana, `/api/proyectos/${proyecto.id}/brief/declaracion`, "POST", {
          angulo: "comodidad",
          aceptado: true,
        }),
        contexto(proyecto.id),
      );
      expect(respuesta.status).toBe(409);
      expect((await respuesta.json()).error).toContain("no afirma nada que haya que declarar");
    });

    test("la declaración de un proyecto ajeno no se puede registrar: 404", async () => {
      const proyecto = await briefCon("mecanismo");
      const respuesta = await rutaDeclaracion.POST(
        pedir(beto, `/api/proyectos/${proyecto.id}/brief/declaracion`, "POST", {
          angulo: "mecanismo",
          aceptado: true,
        }),
        contexto(proyecto.id),
      );
      expect(respuesta.status).toBe(404);
    });
  });

  // ── 6. El interruptor del admin ────────────────────────────────────────────────────────────────────────

  describe("el interruptor del brief en Admin › Ajustes", () => {
    test("apagado deja de aceptar cambios con su motivo, pero no borra ni esconde lo ya escrito", async () => {
      const producto = await productoDe(actorAna, "Champú del interruptor");
      const proyecto = await proyectoDe(actorAna, "Anuncio del interruptor");
      await guardarBrief(actorAna, proyecto.id, { productoId: producto.id, angulo: "identidad" });

      await guardarAjustes({ anuncioBriefActivo: false }, null);
      try {
        const escritura = await rutaBrief.PUT(
          pedir(ana, `/api/proyectos/${proyecto.id}/brief`, "PUT", { publico: "Quien lo ha probado todo." }),
          contexto(proyecto.id),
        );
        expect(escritura.status).toBe(409);
        expect((await escritura.json()).error).toContain("Admin › Ajustes");

        // Leer sigue funcionando: apagar el interruptor no puede perder el trabajo de alguien.
        const lectura = await rutaBrief.GET(
          pedir(ana, `/api/proyectos/${proyecto.id}/brief`, "GET"),
          contexto(proyecto.id),
        );
        expect(lectura.status).toBe(200);
        const cuerpo = (await lectura.json()) as {
          brief: BriefVista | null;
          activo: boolean;
          variantesActivas: boolean;
        };
        expect(cuerpo.activo).toBe(false);
        // Las variantes dependen del brief: sin brief no hay ángulo del que variar.
        expect(cuerpo.variantesActivas).toBe(false);
        expect(cuerpo.brief?.angulo).toBe("identidad");
      } finally {
        await guardarAjustes({ anuncioBriefActivo: true }, null);
      }
    });

    test("las variantes se apagan solas sin tocar el brief", async () => {
      await guardarAjustes({ anuncioVariantesActivas: false }, null);
      try {
        const proyecto = await proyectoDe(actorAna, "Anuncio sin variantes");
        const lectura = await rutaBrief.GET(
          pedir(ana, `/api/proyectos/${proyecto.id}/brief`, "GET"),
          contexto(proyecto.id),
        );
        const cuerpo = (await lectura.json()) as { activo: boolean; variantesActivas: boolean };
        expect(cuerpo.activo).toBe(true);
        expect(cuerpo.variantesActivas).toBe(false);
      } finally {
        await guardarAjustes({ anuncioVariantesActivas: true }, null);
      }
    });
  });
});
