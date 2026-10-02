import type { Ajustes } from "@/server/ajustes";

export function SeccionPrivacidad({
  valores,
  onCambio,
}: {
  valores: Ajustes;
  onCambio: <K extends keyof Ajustes>(clave: K, valor: Ajustes[K]) => void;
}) {
  return (
    <section className="space-y-4 rounded-tarjeta border border-borde bg-superficie p-6">
      <h2 className="text-xl font-bold">Retención y analítica</h2>
      <p>Analítica: desactivada, no configurada. Sin servicios opcionales no se solicita consentimiento analítico.</p>
      <p>
        Estos plazos fijan cuándo revisar los eventos para su eliminación manual. Cero conserva hasta revisión manual.
        No hay limpieza automática ni un plazo jurídico predeterminado.
      </p>
      {(["retencionAuditoriaDias", "retencionCorreosDias"] as const).map((clave) => (
        <label key={clave} className="flex flex-col gap-1">
          {clave === "retencionAuditoriaDias" ? "Auditoría (días)" : "Eventos de correo (días)"}
          <input
            type="number"
            min={0}
            max={3650}
            value={valores[clave]}
            onChange={(e) => onCambio(clave, Number(e.target.value))}
            className="min-h-11 rounded-control border border-borde bg-superficie p-3"
          />
        </label>
      ))}
    </section>
  );
}
