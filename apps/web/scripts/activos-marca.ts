/**
 * Genera los activos de marca de Escenara que se sirven sin marca publicada. Uso: `bun run activos`.
 *
 * Con sharp (sin navegador):
 * - `public/favicon.ico` (16 y 32 px), `public/favicon-16.png` y `public/favicon-32.png`, del favicon simplificado
 *   para 16 px (`docs/branding/escenara-icon-16.svg`, que es también `public/icon.svg`), y los PNG de 16 y 32 px de
 *   `docs/branding`;
 * - `public/marca-escenara/apple-touch-icon.png` (180, servido por la ruta `/apple-touch-icon.png`), `public/icono-192.png`, `public/icono-512.png` y
 *   `public/icono-enmascarable-512.png` (el símbolo dentro de la zona segura del 80 %), del icono detallado
 *   (`docs/branding/escenara-icon.svg`).
 *
 * Con Chrome sin interfaz, si está instalado (`CHROME` o la ruta de macOS) y se pasa `--con-texto`:
 * - `public/imagen-social.png` (1200 × 630) y los PNG del wordmark de `docs/branding`, pintados con **Manrope de
 *   verdad** (la fuente autoalojada de la app). Sharp no puede: rasteriza el texto con las fuentes del sistema, y sin
 *   Manrope instalada saldría la de respaldo. Los PNG resultantes se guardan en el repositorio; no hace falta Chrome
 *   para compilar ni para arrancar.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { icoDePngs } from "../src/lib/ico";

const web = path.resolve(import.meta.dir, "..");
const raiz = path.resolve(web, "../..");
const marca = path.join(raiz, "docs/branding");
const publico = path.join(web, "public");
const AZUL = "#2753D7";

const svg16 = await Bun.file(path.join(marca, "escenara-icon-16.svg")).arrayBuffer();
const svg64 = await Bun.file(path.join(marca, "escenara-icon.svg")).text();

const png = (fuente: ArrayBuffer | Buffer | string, lado: number) =>
  sharp(typeof fuente === "string" ? Buffer.from(fuente) : Buffer.from(fuente as ArrayBuffer), { density: 600 })
    .resize(lado, lado)
    .png({ compressionLevel: 9 })
    .toBuffer();

// Favicon: el de 16 px sale de su propio dibujo (alineado a la rejilla de 16); el de 32, del mismo, que a 2× queda nítido.
const f16 = await png(svg16, 16);
const f32 = await png(svg16, 32);
await Bun.write(path.join(publico, "favicon-16.png"), f16);
await Bun.write(path.join(publico, "favicon-32.png"), f32);
await Bun.write(path.join(publico, "favicon.ico"), icoDePngs([f16, f32]));
// Los PNG del favicon de la guía de marca son los mismos.
await Bun.write(path.join(marca, "escenara-icon-16.png"), f16);
await Bun.write(path.join(marca, "escenara-icon-32.png"), f32);

// Iconos grandes: el símbolo detallado a sangre sobre el azul de la marca (iOS y Android ponen su propia máscara).
const aSangre = svg64.replace(/rx="14"/, 'rx="0"');
await Bun.write(path.join(publico, "marca-escenara/apple-touch-icon.png"), await png(aSangre, 180));
await Bun.write(path.join(publico, "icono-192.png"), await png(svg64, 192));
await Bun.write(path.join(publico, "icono-512.png"), await png(svg64, 512));
// Enmascarable: el símbolo cabe en el círculo central del 80 % aunque el sistema recorte en círculo o en gota.
const simbolo = await png(svg64.replace(/<rect[^>]*\/>/, ""), 330);
await Bun.write(
  path.join(publico, "icono-enmascarable-512.png"),
  await sharp({ create: { width: 512, height: 512, channels: 4, background: AZUL } })
    .composite([{ input: simbolo, left: 91, top: 91 }])
    .png({ compressionLevel: 9 })
    .toBuffer(),
);
console.log("Favicons e iconos generados en public/.");

if (process.argv.includes("--con-texto")) await conTexto();

async function conTexto() {
  const chrome = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (!(await Bun.file(chrome).exists())) {
    console.error(`No hay Chrome en «${chrome}»: la imagen social y los PNG del wordmark se quedan como están.`);
    process.exit(1);
  }
  const fuente = `file://${path.join(web, "src/fonts/manrope-latin-wght-normal.woff2")}`;
  const temporal = await mkdtemp(path.join(tmpdir(), "escenara-activos-"));
  const pintar = async (html: string, ancho: number, alto: number, salida: string) => {
    const pagina = path.join(temporal, "pagina.html");
    await Bun.write(
      pagina,
      `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
@font-face { font-family: Manrope; src: url("${fuente}") format("woff2"); font-weight: 200 800; }
html, body { margin: 0; width: ${ancho}px; height: ${alto}px; overflow: hidden; background: transparent; }
</style></head><body>${html}</body></html>`,
    );
    await rm(salida, { force: true });
    const proceso = Bun.spawn(
      [
        chrome,
        "--headless=new",
        "--disable-gpu",
        // Perfil de usar y tirar: sin llavero del sistema, sin primer arranque y sin extensiones.
        "--use-mock-keychain",
        "--password-store=basic",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-extensions",
        "--hide-scrollbars",
        "--force-device-scale-factor=1",
        "--default-background-color=00000000",
        `--user-data-dir=${path.join(temporal, "perfil")}`,
        `--window-size=${ancho},${alto}`,
        // Da tiempo a que cargue la fuente antes de hacer la captura.
        "--virtual-time-budget=2000",
        `--screenshot=${salida}`,
        `file://${pagina}`,
      ],
      { stdout: "ignore", stderr: "ignore" },
    );
    // En macOS, Chrome sin interfaz escribe la captura y a veces se queda abierto: se espera a que el fichero esté
    // escrito del todo (mismo tamaño dos veces seguidas) y se cierra; si en 30 s no aparece, se da por fallido.
    let anterior = -1;
    for (let intento = 0; intento < 60; intento++) {
      await Bun.sleep(500);
      const tamano = (await Bun.file(salida).exists()) ? Bun.file(salida).size : -1;
      if (tamano > 0 && tamano === anterior) break;
      anterior = tamano;
    }
    proceso.kill();
    await proceso.exited;
    if (!(await Bun.file(salida).exists())) throw new Error(`Chrome no ha podido pintar ${path.basename(salida)}.`);
  };

  try {
    // Wordmark de docs/branding: el mismo SVG, en línea (así usa la Manrope de la página), al tamaño de siempre.
    for (const [nombre, ancho, alto] of [
      ["escenara-horizontal-light", 888, 200],
      ["escenara-horizontal-dark", 888, 200],
      ["escenara-stacked-light", 480, 262],
      ["escenara-stacked-dark", 480, 262],
    ] as const) {
      const dibujo = (await Bun.file(path.join(marca, `${nombre}.svg`)).text()).replace(
        "<svg ",
        `<svg width="${ancho}" height="${alto}" `,
      );
      await pintar(dibujo, ancho, alto, path.join(marca, `${nombre}.png`));
    }

    // Imagen para compartir: el tema oscuro de la marca, el símbolo, el nombre, el lema y el descriptor.
    const marcaJson = (await Bun.file(path.join(marca, "escenara.brand.json")).json()) as {
      theme: { dark: Record<string, string> };
      vibrant: { dark: Record<string, string> };
    };
    const t = marcaJson.theme.dark;
    const v = marcaJson.vibrant.dark;
    const social = `<div style="box-sizing:border-box;width:1200px;height:630px;padding:72px 88px;display:flex;flex-direction:column;justify-content:space-between;background:${t.background};font-family:Manrope,sans-serif;color:${t.text};position:relative;overflow:hidden">
  <div style="position:absolute;top:-180px;right:-120px;width:560px;height:560px;border-radius:50%;background:${v.cobalt};opacity:.35;filter:blur(90px)"></div>
  <div style="position:absolute;bottom:-220px;left:320px;width:520px;height:520px;border-radius:50%;background:${v.fuchsia};opacity:.25;filter:blur(100px)"></div>
  <div style="position:relative;display:flex;align-items:center;gap:28px">
    <svg width="132" height="132" viewBox="0 0 100 100"><g transform="translate(2 2)"><path d="M13 34V17H31M59 17H77V34M77 63V80H59M31 80H13V63" fill="none" stroke="${t.primary}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><path d="M45 32C47 41 51 45 59 48C51 51 47 55 45 64C43 55 39 51 31 48C39 45 43 41 45 32Z" fill="${t.brandSpark}"/></g></svg>
    <span style="font-size:112px;font-weight:700;letter-spacing:-4px;line-height:1">Escenara</span>
  </div>
  <div style="position:relative">
    <p style="margin:0;font-size:64px;font-weight:700;letter-spacing:-1.5px;line-height:1.1">Da vida a cada escena</p>
    <p style="margin:18px 0 0;font-size:34px;font-weight:500;color:${t.textMuted}">Estudio abierto de personajes y vídeo</p>
  </div>
</div>`;
    await pintar(social, 1200, 630, path.join(publico, "imagen-social.png"));
    console.log("Imagen social y PNG del wordmark pintados con Manrope.");
  } finally {
    await rm(temporal, { recursive: true, force: true });
  }
}
