import { Logotipo } from "@/components/ui/logotipo";
import { MascotaChispa } from "@/components/ui/mascota";

export function Pie({ version }: { version: string }) {
  return (
    <footer className="border-t border-borde/40 bg-superficie">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-12 md:flex-row md:items-center md:justify-between md:px-8">
        <div className="flex items-center gap-4 text-texto">
          <MascotaChispa expresion="senala" tamano={48} />
          <div>
            <Logotipo className="h-7" />
            <p className="mt-1 text-sm text-texto-suave">Estudio abierto de personajes y vídeo · en construcción</p>
          </div>
        </div>
        <div className="flex flex-col gap-1 text-sm text-texto-suave md:items-end">
          <a href="mailto:info@escenara.com" className="font-semibold text-acento underline-offset-4 hover:underline">
            info@escenara.com
          </a>
          <span>Versión {version} · Código abierto bajo licencia AGPL 3.0</span>
        </div>
      </div>
    </footer>
  );
}
