import path from "node:path";
import { analizarChangelog, type VersionPublicada } from "@/lib/changelog";

/** `docs/CHANGELOG.md` de la raíz del monorepo: la única fuente del historial de versiones. */
export const RUTA_CHANGELOG = path.resolve(process.cwd(), "../../docs/CHANGELOG.md");

export async function leerVersiones(): Promise<VersionPublicada[] | null> {
  const archivo = Bun.file(RUTA_CHANGELOG);
  if (!(await archivo.exists())) return null;
  return analizarChangelog(await archivo.text());
}
