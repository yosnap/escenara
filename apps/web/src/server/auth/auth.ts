import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins";
import { count, sql } from "drizzle-orm";
import { IDIOMAS, TEMAS } from "@/lib/preferencias";
import { type Ajustes, leerAjustes } from "../ajustes";
import { enviarEnSegundoPlano, plantillaEnlace } from "../correo";
import { db } from "../db/cliente";
import * as esquema from "../db/esquema";
import { dentroDelLimite } from "./limite-cuenta";

const URL_BASE = process.env.BETTER_AUTH_URL ?? "http://localhost:3021";

/** Google y GitHub solo se activan si sus claves OAuth están en `.env`. */
function proveedoresSociales() {
  const proveedores: Record<string, { clientId: string; clientSecret: string }> = {};
  for (const [nombre, prefijo] of [
    ["google", "GOOGLE"],
    ["github", "GITHUB"],
  ] as const) {
    const clientId = process.env[`${prefijo}_CLIENT_ID`];
    const clientSecret = process.env[`${prefijo}_CLIENT_SECRET`];
    if (clientId && clientSecret) proveedores[nombre] = { clientId, clientSecret };
  }
  return proveedores;
}

export const proveedoresActivos = () => Object.keys(proveedoresSociales()) as ("google" | "github")[];

// Una vez existe una cuenta, la instalación nunca vuelve a estar vacía: se memoriza para no contar en cada visita.
let hayCuentasMemo = false;

async function hayCuentas(): Promise<boolean> {
  if (hayCuentasMemo) return true;
  const [fila] = await db().select({ total: count() }).from(esquema.users);
  hayCuentasMemo = (fila?.total ?? 0) > 0;
  return hayCuentasMemo;
}

/** Se puede crear una cuenta si el registro está abierto o si aún no existe ninguna (la del administrador). */
export async function registroDisponible(): Promise<boolean> {
  return (await leerAjustes()).registroAbierto || !(await hayCuentas());
}

const LARGO_MAX_NOMBRE = 80;

/** Deja solo valores admitidos en las preferencias y acota el nombre; lo demás vuelve al valor por defecto. */
function limpiarPreferencias<T extends Record<string, unknown>>(datos: T): T {
  const limpio: Record<string, unknown> = { ...datos };
  if (typeof limpio.name === "string") limpio.name = limpio.name.trim().slice(0, LARGO_MAX_NOMBRE);
  if ("tema" in limpio && !(TEMAS as readonly unknown[]).includes(limpio.tema)) limpio.tema = "system";
  if ("idioma" in limpio && !(IDIOMAS as readonly unknown[]).includes(limpio.idioma)) limpio.idioma = "es";
  return limpio as T;
}

/**
 * Cabeceras de las que se toma la IP para el límite de intentos por IP (Admin › Ajustes). Solo son
 * fiables si las escribe un proxy propio que sobrescriba lo que mande el cliente. Sin ajuste se usa
 * `x-forwarded-for`, que Next rellena con la IP de la conexión pero que el cliente puede falsificar; sin
 * ninguna cabecera, todas las peticiones compartirían un único contador y cualquiera podría bloquear el
 * acceso a todos. La defensa que no depende de la IP es el límite por cuenta (limite-cuenta.ts).
 */
function cabecerasIp(ajustes: Ajustes): string[] {
  const configuradas = ajustes.cabecerasIp
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
  return configuradas.length > 0 ? configuradas : ["x-forwarded-for"];
}

function crearAuth(ajustes: Ajustes) {
  const secreto = process.env.BETTER_AUTH_SECRET;
  // Sin secreto propio, Better Auth usaría uno conocido y cualquiera podría firmar cookies de sesión.
  if (!secreto || secreto.length < 32) {
    throw new Error("Falta BETTER_AUTH_SECRET en .env (32 caracteres o más; genera uno con: openssl rand -base64 32).");
  }
  return betterAuth({
    appName: "Escenara",
    baseURL: URL_BASE,
    secret: secreto,
    trustedOrigins: [URL_BASE],
    database: drizzleAdapter(db(), { provider: "pg", schema: esquema, usePlural: true }),
    advanced: { database: { generateId: "uuid" }, ipAddress: { ipAddressHeaders: cabecerasIp(ajustes) } },
    // Sin enlazado automático de cuentas: evita que una cuenta con contraseña creada por otra persona con
    // tu correo (sin verificar) se una a tu acceso con Google o GitHub. Revisar antes de activarlo.
    account: { accountLinking: { enabled: false } },
    user: {
      additionalFields: {
        tema: { type: "string", defaultValue: "system", required: false },
        idioma: { type: "string", defaultValue: "es", required: false },
      },
    },
    session: {
      // Copia firmada de la sesión en una cookie (5 min) para el tema y el idioma de cada página sin consultar
      // la base de datos. El admin, la API y la página de cuenta la ignoran y comprueban la base de datos
      // (ver sesion.ts): así una sesión cerrada o un rol retirado dejan de valer al momento.
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        enviarEnSegundoPlano({
          para: user.email,
          asunto: "Restablece tu contraseña de Escenara",
          ...plantillaEnlace({
            nombre: user.name,
            titulo: "Restablece tu contraseña",
            texto: "Hemos recibido una solicitud para cambiar la contraseña de tu cuenta.",
            boton: "Elegir una contraseña nueva",
            url,
            nota: "El enlace caduca en una hora. Si no lo has pedido tú, ignora este correo: tu contraseña no cambia.",
          }),
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 24 * 60 * 60,
      sendVerificationEmail: async ({ user, url }) => {
        enviarEnSegundoPlano({
          para: user.email,
          asunto: "Confirma tu correo en Escenara",
          ...plantillaEnlace({
            nombre: user.name,
            titulo: "¡Te damos la bienvenida a Escenara!",
            texto: "Confirma tu correo para activar la cuenta y empezar a crear.",
            boton: "Confirmar mi correo",
            url,
            nota: "El enlace caduca en 24 horas. Si no has creado una cuenta, ignora este correo.",
          }),
        });
      },
    },
    socialProviders: proveedoresSociales(),
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 3 },
        "/request-password-reset": { window: 60, max: 3 },
        "/send-verification-email": { window: 60, max: 3 },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        // Registro cerrado: se rechaza antes del alta para poder decirlo (el alta en sí no revela errores).
        if (ctx.path === "/sign-up/email" && !(await registroDisponible())) {
          throw new APIError("FORBIDDEN", { code: "REGISTRO_CERRADO", message: "El registro está cerrado." });
        }
        const email = (ctx.body as { email?: unknown } | undefined)?.email;
        if (typeof email === "string" && !(await dentroDelLimite(ctx.path, email))) {
          throw new APIError("TOO_MANY_REQUESTS", { message: "Demasiados intentos para esta cuenta." });
        }
      }),
    },
    databaseHooks: {
      user: {
        create: {
          // La primera cuenta de la instalación es administradora; con el registro cerrado, nadie más entra.
          before: async (usuario) => {
            const esPrimera = !(await hayCuentas());
            if (!esPrimera && !(await leerAjustes()).registroAbierto) {
              throw new APIError("FORBIDDEN", { message: "El registro está cerrado en esta instalación." });
            }
            return { data: { ...limpiarPreferencias(usuario), role: esPrimera ? "admin" : "user" } };
          },
          // Si dos altas simultáneas se creyeron «la primera», solo conserva el rol la más antigua.
          after: async (usuario) => {
            hayCuentasMemo = true;
            if ((usuario as { role?: string }).role !== "admin") return;
            await db().execute(sql`
              update users set role = 'user'
              where id = ${usuario.id} and exists (
                select 1 from users otro
                where otro.role = 'admin' and otro.id <> ${usuario.id}
                  and (otro.created_at, otro.id) < (${usuario.createdAt}, ${usuario.id}::uuid)
              )
            `);
          },
        },
        update: {
          before: async (cambios) => ({ data: limpiarPreferencias(cambios) }),
        },
      },
    },
    plugins: [
      admin({ defaultRole: "user", adminRoles: ["admin"] }),
      passkey({ rpID: new URL(URL_BASE).hostname, rpName: "Escenara", origin: URL_BASE }),
      // Siempre el último: aplica las cookies de sesión en las acciones de servidor.
      nextCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof crearAuth>;

const global = globalThis as { __escenaraAuth?: { instancia: Auth; clave: string } };

/**
 * Instancia de Better Auth. Se crea al primer uso (no al importar: el build no necesita la base de datos)
 * y se vuelve a crear cuando cambian los ajustes de Admin › Ajustes.
 */
export async function auth(): Promise<Auth> {
  const ajustes = await leerAjustes();
  // Solo la cabecera de IP forma parte de la configuración de Better Auth; el resto se lee en cada uso.
  const clave = ajustes.cabecerasIp;
  if (global.__escenaraAuth?.clave !== clave) global.__escenaraAuth = { instancia: crearAuth(ajustes), clave };
  return global.__escenaraAuth.instancia;
}
