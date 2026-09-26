/** Regenera src/styles/tokens.css desde la marca. Uso: bun run tokens */
import path from "node:path";
import { generarCss, type Marca } from "../src/lib/tokens";

const raiz = path.resolve(import.meta.dir, "../../..");
const marca = (await Bun.file(path.join(raiz, "docs/branding/escenara.brand.json")).json()) as Marca;
await Bun.write(path.resolve(import.meta.dir, "../src/styles/tokens.css"), generarCss(marca));
console.log(`tokens.css generado (marca ${marca.brandVersion})`);
