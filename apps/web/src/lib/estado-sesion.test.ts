import { afterEach, expect, spyOn, test } from "bun:test";
import { comprobarSesion } from "./estado-sesion";

let peticion: ReturnType<typeof spyOn> | undefined;
afterEach(() => peticion?.mockRestore());
const comprobar = async (respuesta: Response) => {
  peticion = spyOn(globalThis, "fetch").mockResolvedValue(respuesta);
  return comprobarSesion(new AbortController().signal);
};
test("consulta el servidor sin caché y conserva las cookies de acceso", async () => {
  expect(await comprobar(Response.json({ session: { id: "s" }, user: { id: "u" } }))).toBe(true);
  expect(peticion).toHaveBeenCalledWith(
    "/api/auth/get-session?disableCookieCache=true",
    expect.objectContaining({ cache: "no-store", credentials: "same-origin" }),
  );
});
test("reconoce una sesión ausente y un rechazo de acceso", async () => {
  expect(await comprobar(Response.json(null))).toBe(false);
  peticion?.mockRestore();
  expect(await comprobar(new Response(null, { status: 401 }))).toBe(false);
});
test("no confunde fallo del servidor ni datos ilegibles con cierre de sesión", async () => {
  for (const respuesta of [
    new Response(null, { status: 503 }),
    Response.json({ error: "fallo" }),
    new Response("no es JSON"),
  ]) {
    expect(await comprobar(respuesta)).toBeNull();
    peticion?.mockRestore();
  }
});
test("no cierra la sesión por pérdida de conexión", async () => {
  peticion = spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));
  expect(await comprobarSesion(new AbortController().signal)).toBeNull();
});
