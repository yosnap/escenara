import { beforeAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

// Secretos de la instalación (contraseña SMTP y claves OAuth). Estos tests cambian la configuración de la
// instalación, que es única: se ejecutan contra una base de datos aparte para no tocar la de desarrollo.
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_boveda");
}

const { exigirBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");

const { like } = await import("drizzle-orm");
const { db } = await import("../db/cliente");
const { installationSecrets, settings } = await import("../db/esquema");
const { aplicarMigraciones } = await import("../db/migrar");
const { guardarAjustes, leerAjustes, olvidarAjustes } = await import("../ajustes");
const { cifrar, descifrar, idClaveActual, idClaveDe, olvidarClaves } = await import("./cifrado");
const { CLAVES_SECRETAS, ErrorSecreto, guardarSecreto, leerSecreto, listarSecretos, olvidarSecretos, quitarSecreto } =
  await import("./secretos");
const { PREFIJO_MARCADOR_IMPORTACION, importarClavesDelEntorno, olvidarImportacion } = await import(
  "./importar-entorno"
);
const { recifrarBoveda } = await import("./recifrar");
const { auth, proveedoresActivos, urlRedireccion } = await import("../auth/auth");

const SECRETO_SMTP = "contrasena-smtp-inventada-1111";
const SECRETO_GOOGLE = "GOCSPX-inventado-para-el-test-2222";
const TODOS = [SECRETO_SMTP, SECRETO_GOOGLE];

const sinSecretos = (texto: string) => {
  for (const s of TODOS) expect(texto).not.toContain(s);
};

const VARIABLES = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"] as const;

/** Deja la instalación de prueba sin secretos, sin claves de acceso y sin marcador de importación. */
async function limpiar() {
  // Esto cambia configuración de toda la instalación: nunca en una base de datos que no sea la de prueba.
  exigirBaseDeDatosDePrueba("escenara_pruebas_boveda");
  for (const clave of CLAVES_SECRETAS) await quitarSecreto(clave);
  await db()
    .delete(settings)
    .where(like(settings.key, `${PREFIJO_MARCADOR_IMPORTACION}%`));
  await guardarAjustes({ googleClientId: "", githubClientId: "" }, null);
  for (const v of VARIABLES) delete process.env[v];
  olvidarSecretos();
  olvidarAjustes();
  olvidarImportacion();
}

describe.skipIf(!hayBaseDeDatos)("secretos de la instalación", () => {
  beforeAll(async () => {
    await aplicarMigraciones();
    await limpiar();
  });

  test("la clave de Resend se guarda cifrada y el panel solo recibe su pista", async () => {
    const secreto = "re_clave_ficticia_para_pruebas_3333";
    try {
      await guardarSecreto("resendApiKey", secreto, null);
      expect(await leerSecreto("resendApiKey")).toBe(secreto);
      const vistas = await listarSecretos();
      expect(vistas.find((v) => v.clave === "resendApiKey")?.pista).toBe("3333");
      expect(JSON.stringify(vistas)).not.toContain(secreto);
      const filas = await db().select().from(installationSecrets);
      expect(filas.find((f) => f.key === "resendApiKey")?.value).not.toContain(secreto);
      await expect(guardarSecreto("resendApiKey", "no-es-una-clave", null)).rejects.toThrow("clave API válida");
      expect(await leerSecreto("resendApiKey")).toBe(secreto);
    } finally {
      await quitarSecreto("resendApiKey");
    }
  });

  describe("guardar, leer y quitar", () => {
    beforeAll(() => guardarSecreto("smtpContrasena", SECRETO_SMTP, null));

    test("se guarda cifrado, solo el servidor lo lee y a la interfaz llega la pista", async () => {
      const [fila] = await db().select().from(installationSecrets);
      sinSecretos(JSON.stringify(fila));
      expect(fila?.value).toStartWith("v1.");
      expect(await listarSecretos()).toEqual([
        { clave: "smtpContrasena", pista: "1111", actualizado: expect.any(String) },
      ]);
      sinSecretos(JSON.stringify(await listarSecretos()));
      expect(await leerSecreto("smtpContrasena")).toBe(SECRETO_SMTP);
    });

    test("un secreto no se descifra como si fuera otro (AAD)", async () => {
      const [fila] = await db().select().from(installationSecrets);
      expect(() => descifrar(fila?.value ?? "", "ajuste:googleClientSecret")).toThrow();
      expect(() => descifrar(fila?.value ?? "", "ajuste:smtpContrasena")).not.toThrow();
    });

    test("un secreto corto no muestra pista, solo que está guardado", async () => {
      await guardarSecreto("smtpContrasena", "corta12", null);
      expect((await listarSecretos())[0]?.pista).toBe("");
      await guardarSecreto("smtpContrasena", SECRETO_SMTP, null);
    });

    test("se rechaza un valor vacío y uno excesivo", async () => {
      for (const malo of ["", "   ", "x".repeat(501)]) {
        await expect(guardarSecreto("smtpContrasena", malo, null)).rejects.toThrow(ErrorSecreto);
      }
      // El anterior sigue intacto.
      expect(await leerSecreto("smtpContrasena")).toBe(SECRETO_SMTP);
    });

    test("quitar un secreto lo borra de verdad", async () => {
      expect(await quitarSecreto("smtpContrasena")).toBe(true);
      expect(await quitarSecreto("smtpContrasena")).toBe(false);
      expect(await leerSecreto("smtpContrasena")).toBeNull();
      expect(await listarSecretos()).toEqual([]);
    });
  });

  describe("acceso con Google desde el panel, sin .env", () => {
    beforeAll(limpiar);

    test("con el identificador y el secreto puestos, el proveedor se activa", async () => {
      await guardarAjustes({ googleClientId: "escenara-test.apps.googleusercontent.com" }, null);
      await guardarSecreto("googleClientSecret", SECRETO_GOOGLE, null);
      expect(await proveedoresActivos()).toEqual(["google"]);
    });

    test("Better Auth inicia el flujo de Google con esas claves", async () => {
      const respuesta = await (await auth()).handler(
        new Request("http://localhost:3021/api/auth/sign-in/social", {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: "http://localhost:3021" },
          body: JSON.stringify({ provider: "google", callbackURL: "/cuenta" }),
        }),
      );
      expect(respuesta.status).toBe(200);
      const cuerpo = (await respuesta.json()) as { url?: string };
      expect(cuerpo.url).toContain("accounts.google.com");
      expect(cuerpo.url).toContain(encodeURIComponent(urlRedireccion("google")));
      // El secreto de cliente no forma parte de la redirección (solo el identificador).
      sinSecretos(cuerpo.url ?? "");
    });

    test("quitar el secreto desactiva el proveedor", async () => {
      await quitarSecreto("googleClientSecret");
      expect(await proveedoresActivos()).toEqual([]);
    });

    test("quitar el identificador también lo desactiva", async () => {
      await guardarSecreto("googleClientSecret", SECRETO_GOOGLE, null);
      await guardarAjustes({ googleClientId: "" }, null);
      expect(await proveedoresActivos()).toEqual([]);
    });
  });

  describe("importación única desde .env", () => {
    beforeAll(limpiar);

    test("las claves del .env pasan al panel, cifradas, y se avisa de que ya sobran", async () => {
      process.env.GITHUB_CLIENT_ID = "Ov23liInventadoTest";
      process.env.GITHUB_CLIENT_SECRET = SECRETO_GOOGLE;
      olvidarImportacion();

      const aviso = await importarClavesDelEntorno();
      expect(aviso.variables).toEqual(["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"]);
      expect((await leerAjustes()).githubClientId).toBe("Ov23liInventadoTest");
      expect((await listarSecretos()).map((s) => s.clave)).toEqual(["githubClientSecret"]);
      expect(await leerSecreto("githubClientSecret")).toBe(SECRETO_GOOGLE);
      expect(await proveedoresActivos()).toEqual(["github"]);
      // Queda el marcador de instalación: es lo que impide una segunda importación.
      const marcadores = await db()
        .select({ key: settings.key })
        .from(settings)
        .where(like(settings.key, `${PREFIJO_MARCADOR_IMPORTACION}%`));
      expect(marcadores).toEqual([{ key: `${PREFIJO_MARCADOR_IMPORTACION}github` }]);
    });

    test("no se repite ni sobrescribe lo que ya está en el panel", async () => {
      process.env.GITHUB_CLIENT_ID = "otro-identificador-del-entorno";
      olvidarImportacion();
      expect((await importarClavesDelEntorno()).variables).toEqual(["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"]);
      expect((await leerAjustes()).githubClientId).toBe("Ov23liInventadoTest");
    });

    test("si el admin quita la clave en el panel, el .env no la resucita", async () => {
      // Es la decisión del propietario: el panel manda y el `.env` deja de usarse, ni como respaldo.
      await quitarSecreto("githubClientSecret");
      await guardarAjustes({ githubClientId: "" }, null);
      process.env.GITHUB_CLIENT_ID = "Ov23liInventadoTest";
      process.env.GITHUB_CLIENT_SECRET = SECRETO_GOOGLE;
      olvidarImportacion();

      expect((await importarClavesDelEntorno()).variables).toEqual(["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"]);
      expect((await leerAjustes()).githubClientId).toBe("");
      expect(await listarSecretos()).toEqual([]);
      expect(await proveedoresActivos()).toEqual([]);
    });

    test("sin nada en el .env no hay aviso", async () => {
      delete process.env.GITHUB_CLIENT_ID;
      delete process.env.GITHUB_CLIENT_SECRET;
      olvidarImportacion();
      expect((await importarClavesDelEntorno()).variables).toEqual([]);
    });

    test("sin clave maestra no se importa nada y se avisa de que el acceso queda desactivado", async () => {
      await limpiar();
      process.env.GOOGLE_CLIENT_ID = "escenara-test.apps.googleusercontent.com";
      process.env.GOOGLE_CLIENT_SECRET = SECRETO_GOOGLE;
      const maestra = process.env.ESCENARA_CLAVE_MAESTRA;
      delete process.env.ESCENARA_CLAVE_MAESTRA;
      const errores: string[] = [];
      const original = console.error;
      console.error = (...args: unknown[]) => errores.push(args.map(String).join(" "));
      try {
        expect((await importarClavesDelEntorno()).variables).toEqual([]);
      } finally {
        console.error = original;
        process.env.ESCENARA_CLAVE_MAESTRA = maestra;
      }
      const aviso = errores.join("\n");
      expect(aviso).toContain("ESCENARA_CLAVE_MAESTRA");
      expect(aviso).toContain("desactivado");
      // El aviso no lleva ningún valor del entorno, y no hay respaldo: el proveedor sigue apagado.
      sinSecretos(aviso);
      expect(aviso).not.toContain("escenara-test.apps.googleusercontent.com");
      expect(await proveedoresActivos()).toEqual([]);
      await limpiar();
    });
  });

  describe("las acciones del panel exigen rol de administrador", () => {
    beforeAll(limpiar);

    /**
     * Las acciones de servidor solo se pueden invocar dentro de una petición: `exigirAdmin` lee las
     * cabeceras y comprueba la sesión contra la base de datos. Fuera de una petición no hay cabeceras, así
     * que la acción falla antes de tocar nada. Eso demuestra que no hay camino hasta la base de datos que
     * no pase por la comprobación del rol.
     */
    test("sin sesión de administración no se guarda ni se quita nada", async () => {
      const { guardarSecretoAccion, quitarSecretoAccion } = await import("@/app/admin/ajustes/acciones-secretos");
      await expect(guardarSecretoAccion("smtpContrasena", SECRETO_SMTP, null)).rejects.toThrow();
      await expect(quitarSecretoAccion("smtpContrasena", null)).rejects.toThrow();
      expect(await db().select().from(installationSecrets)).toEqual([]);
    });

    test("todas las acciones de secretos empiezan comprobando el rol", async () => {
      const codigo = await Bun.file(
        path.resolve(import.meta.dirname, "../../app/admin/ajustes/acciones-secretos.ts"),
      ).text();
      const cuerpos = [...codigo.matchAll(/export async function (\w+)\([^)]*\)[^{]*\{([\s\S]*?)\n\}/g)];
      expect(cuerpos.length).toBeGreaterThanOrEqual(2);
      for (const [, nombre, cuerpo] of cuerpos) {
        const posicionComprobacion = (cuerpo as string).indexOf("exigirAdmin");
        expect(posicionComprobacion, `${nombre} no comprueba el rol`).toBeGreaterThanOrEqual(0);
        for (const escritura of ["guardarSecreto(", "quitarSecreto("]) {
          const posicionEscritura = (cuerpo as string).indexOf(escritura);
          if (posicionEscritura >= 0) {
            expect(posicionEscritura, `${nombre} escribe antes de comprobar el rol`).toBeGreaterThan(
              posicionComprobacion,
            );
          }
        }
      }
    });
  });

  describe("recifrado", () => {
    beforeAll(limpiar);

    test("no toca lo que ya está al día y lo deja legible", async () => {
      await guardarSecreto("smtpContrasena", SECRETO_SMTP, null);
      const [antes] = await db().select().from(installationSecrets);
      expect(idClaveDe(antes?.value ?? "")).toBe(idClaveActual());
      const resumen = await recifrarBoveda(() => {});
      expect(resumen.secretos).toEqual({ recifradas: 0, alDia: 1, ilegibles: 0, cambiadas: 0 });
      expect(await leerSecreto("smtpContrasena")).toBe(SECRETO_SMTP);
    });

    test("un secreto cifrado con la maestra anterior se recifra y queda legible con la actual", async () => {
      const vieja = randomBytes(32).toString("base64");
      const antiguo = cifrar(SECRETO_SMTP, "ajuste:smtpContrasena", { ESCENARA_CLAVE_MAESTRA: vieja });
      await db()
        .insert(installationSecrets)
        .values({ key: "smtpContrasena", value: antiguo, hint: "1111" })
        .onConflictDoUpdate({ target: installationSecrets.key, set: { value: antiguo, hint: "1111" } });
      olvidarSecretos();
      // Sin la anterior en el entorno no hay forma de leerlo.
      expect(await leerSecreto("smtpContrasena")).toBeNull();

      process.env.ESCENARA_CLAVE_MAESTRA_ANTERIOR = vieja;
      olvidarClaves();
      const fallos: string[] = [];
      const resumen = await recifrarBoveda((m) => {
        fallos.push(m);
      });
      delete process.env.ESCENARA_CLAVE_MAESTRA_ANTERIOR;
      olvidarClaves();
      olvidarSecretos();

      expect(resumen.secretos).toMatchObject({ recifradas: 1, cambiadas: 0, ilegibles: 0 });
      expect(fallos).toEqual([]);
      expect(await leerSecreto("smtpContrasena")).toBe(SECRETO_SMTP);
      const [despues] = await db().select().from(installationSecrets);
      expect(idClaveDe(despues?.value ?? "")).toBe(idClaveActual());
    });
  });
});
