import { expect, test } from "bun:test";
import { proveedorCorreoInicial } from "./ajustes-correo";
import { ErrorCorreo, enviarPorResend } from "./correo-resend";

const mensaje = {
  from: "Escenara <no-responder@escenara.example>",
  to: ["alex@example.test"],
  subject: "Confirmación",
  text: "Texto",
  html: "<p>Texto</p>",
};
const simular = (respuesta: Response) => async () => respuesta;

test("Resend predeterminado; SMTP anterior y selección explícita se conservan", () => {
  expect(proveedorCorreoInicial([])).toBe("resend");
  expect(proveedorCorreoInicial([{ key: "smtpHost", value: "localhost" }])).toBe("smtp");
  expect(
    proveedorCorreoInicial([
      { key: "smtpHost", value: "smtp.example.test" },
      { key: "correoProveedor", value: "resend" },
    ]),
  ).toBe("resend");
  expect(proveedorCorreoInicial([{ key: "correoProveedor", value: "smtp" }])).toBe("smtp");
});

test("envía HTML y texto por la API oficial con clave e idempotencia; aceptación requiere id", async () => {
  const solicitar = async (url: string | URL | Request, opciones?: RequestInit) => {
    expect(url).toBe("https://api.resend.com/emails");
    expect(opciones?.method).toBe("POST");
    expect(opciones?.redirect).toBe("error");
    expect(new Headers(opciones?.headers).get("Authorization")).toBe("Bearer re_prueba_sintetica");
    expect(new Headers(opciones?.headers).get("Idempotency-Key")).toMatch(/^[a-f0-9-]{36}$/);
    expect(JSON.parse(opciones?.body as string)).toEqual(mensaje);
    return Response.json({ id: "correo-sintetico" });
  };
  expect(await enviarPorResend("re_prueba_sintetica", mensaje, solicitar)).toEqual({ aceptado: true });
});

test("sin clave no llama a la red", async () => {
  let llamadas = 0;
  const solicitar = async () => {
    llamadas++;
    return Response.json({});
  };
  await expect(enviarPorResend(null, mensaje, solicitar)).rejects.toThrow("Configura la clave");
  expect(llamadas).toBe(0);
});

test("rechazos e incertidumbre no reintentan ni filtran respuestas privadas", async () => {
  for (const status of [401, 403, 408, 409, 429, 500, 503]) {
    let llamadas = 0;
    const solicitar = async () => {
      llamadas++;
      return Response.json({ message: "secreto-no-publicable" }, { status });
    };
    try {
      await enviarPorResend("re_prueba_sintetica", mensaje, solicitar);
      throw new Error("Debía fallar");
    } catch (error) {
      expect(error).toBeInstanceOf(ErrorCorreo);
      expect((error as ErrorCorreo).rechazado).toBe([401, 403, 429].includes(status));
      expect((error as Error).message).not.toContain("secreto-no-publicable");
    }
    expect(llamadas).toBe(1);
  }
  await expect(enviarPorResend("re_prueba_sintetica", mensaje, simular(Response.json({})))).rejects.toThrow(
    "confirmación válida",
  );
  const fallo = async () => {
    throw new Error("clave-privada");
  };
  await expect(enviarPorResend("re_prueba_sintetica", mensaje, fallo)).rejects.toThrow("incierto");
});
