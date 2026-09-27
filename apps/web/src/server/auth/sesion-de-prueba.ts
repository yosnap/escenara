import { eq } from "drizzle-orm";
import { db } from "../db/cliente";
import { users } from "../db/esquema";
import { auth } from "./auth";

/**
 * Solo para tests de integración: crea un usuario verificado con el rol indicado, inicia sesión y
 * devuelve su identificador, la cabecera `Cookie` de su sesión y una función para borrarlo al terminar.
 */
export async function crearSesionDePrueba(rol: "admin" | "user") {
  const email = `prueba-${crypto.randomUUID().slice(0, 8)}@escenara.test`;
  const password = `clave-${crypto.randomUUID()}`;
  await (await auth()).api.signUpEmail({ body: { name: `Prueba ${rol}`, email, password } });
  const [creado] = await db()
    .update(users)
    .set({ emailVerified: true, role: rol })
    .where(eq(users.email, email))
    .returning({ id: users.id });
  if (!creado) throw new Error("No se ha podido crear el usuario de prueba.");
  const respuesta = await (await auth()).api.signInEmail({ body: { email, password }, asResponse: true });
  const cookie = respuesta.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  if (!cookie) throw new Error(`No se ha podido iniciar sesión de prueba (${respuesta.status})`);
  return {
    id: creado.id,
    email,
    password,
    cookie,
    borrar: () => db().delete(users).where(eq(users.email, email)),
  };
}
