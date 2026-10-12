import { describe, expect, test } from "bun:test";
import { errorDeOrigen } from "./origen";

const PUBLICA = "https://escenara.com";
const INTERNA = "http://0.0.0.0:3021/api/personajes";

function peticion(origen?: string, url = INTERNA, cabeceras: Record<string, string> = {}) {
  return new Request(url, {
    method: "POST",
    headers: { ...cabeceras, ...(origen === undefined ? {} : { origin: origen }) },
  });
}

describe("origen de las escrituras detrás del proxy", () => {
  test("lee la URL pública en ejecución y usa la URL de petición si no está configurada", () => {
    const anterior = process.env.BETTER_AUTH_URL;
    try {
      process.env.BETTER_AUTH_URL = PUBLICA;
      expect(errorDeOrigen(peticion(PUBLICA))).toBeNull();
      delete process.env.BETTER_AUTH_URL;
      expect(errorDeOrigen(peticion("http://localhost:3021", "http://localhost:3021/api/personajes"))).toBeNull();
      expect(errorDeOrigen(peticion(PUBLICA))).toBe("Esta petición no viene de Escenara.");
    } finally {
      if (anterior === undefined) delete process.env.BETTER_AUTH_URL;
      else process.env.BETTER_AUTH_URL = anterior;
    }
  });

  test("acepta el dominio público aunque Next use su dirección interna", () => {
    expect(errorDeOrigen(peticion(PUBLICA), PUBLICA)).toBeNull();
  });

  test("compara protocolo, dominio y puerto con el origen configurado", () => {
    for (const origen of [
      "http://escenara.com",
      "https://escenara.com:3021",
      "https://escenara.com.atacante.test",
      "https://www.escenara.com",
      "https://atacante.test",
      "http://0.0.0.0:3021",
    ]) {
      expect(errorDeOrigen(peticion(origen), PUBLICA)).toBe("Esta petición no viene de Escenara.");
    }
  });

  test("rechaza origen ausente, opaco, mal formado o con componentes que no son un origen", () => {
    expect(errorDeOrigen(peticion(), PUBLICA)).toBe("Petición sin origen: vuelve a cargar la página.");
    for (const origen of [
      "null",
      "no es una URL",
      `${PUBLICA}/ruta`,
      `${PUBLICA}?x=1`,
      `${PUBLICA}#x`,
      "https://usuario@escenara.com",
      "file://escenara.com",
    ]) {
      expect(errorDeOrigen(peticion(origen), PUBLICA)).toBe("Origen no válido.");
    }
  });

  test("no confía en Host ni en cabeceras de proxy enviadas por el cliente", () => {
    expect(
      errorDeOrigen(
        peticion("https://atacante.test", INTERNA, {
          host: "atacante.test",
          "x-forwarded-host": "atacante.test",
          "x-forwarded-proto": "https",
        }),
        PUBLICA,
      ),
    ).toBe("Esta petición no viene de Escenara.");
    expect(errorDeOrigen(peticion("https://atacante.test", "https://atacante.test/api/personajes"), PUBLICA)).toBe(
      "Esta petición no viene de Escenara.",
    );
  });

  test("en local compara con la URL de la petición cuando no hay URL pública", () => {
    const local = "http://localhost:3021/api/personajes";
    expect(errorDeOrigen(peticion("http://localhost:3021", local), local)).toBeNull();
    expect(errorDeOrigen(peticion("https://localhost:3021", local), local)).toBe("Esta petición no viene de Escenara.");
  });

  test("una configuración inválida no permite escrituras", () => {
    for (const url of ["", "no es una URL", "file://escenara.com"]) {
      expect(errorDeOrigen(peticion(PUBLICA), url)).toBe("Esta petición no viene de Escenara.");
    }
  });
});
