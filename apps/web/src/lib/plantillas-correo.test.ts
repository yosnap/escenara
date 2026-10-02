import { expect, test } from "bun:test";
import { MUESTRAS_CORREO, plantillaEnlace } from "./plantillas-correo";

test("todos los flujos ofrecen HTML adaptable y alternativa de texto con enlace y aviso", () => {
  for (const muestra of MUESTRAS_CORREO) {
    const correo = plantillaEnlace(muestra);
    expect(correo.html).toContain('lang="es"');
    expect(correo.html).toContain('role="presentation"');
    expect(correo.html).toContain('name="viewport"');
    expect(correo.texto).toContain(muestra.url);
    expect(correo.texto).toContain(muestra.nota);
    expect(correo.html).not.toContain("<script");
    expect(correo.html).not.toContain("<img");
    expect(correo.html).not.toContain("<link");
  }
});

test("escapa los datos y rechaza protocolos ejecutables", () => {
  const muestra = MUESTRAS_CORREO[0];
  if (!muestra) throw new Error("Falta la muestra de confirmación");
  const correo = plantillaEnlace({
    ...muestra,
    nombre: '<img src=x onerror="alert(1)">',
    nota: "<script>secreto</script>",
    url: 'https://escenara.example/?a="&b=1',
  });
  expect(correo.html).toContain("&lt;img");
  expect(correo.html).toContain("&lt;script&gt;");
  expect(correo.html).not.toContain("<img src=x");
  expect(correo.html).toContain("&amp;b=1");
  for (const url of ["javascript:alert(1)", "data:text/html,hola", "file:///tmp/hola"])
    expect(() => plantillaEnlace({ ...muestra, url })).toThrow("HTTP o HTTPS");
});
