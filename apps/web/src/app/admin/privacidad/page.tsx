import { exigirAdmin } from "@/server/auth/sesion";
import { PaginaAdmin } from "../ui-admin";

export const metadata = { title: "Privacidad · Administración" };
export default async function Privacidad() {
  await exigirAdmin("/admin/privacidad");
  return (
    <PaginaAdmin titulo="Privacidad y servicios">
      <section className="space-y-3">
        <h2 className="text-xl font-bold">Analítica opcional</h2>
        <p>
          Desactivada · No configurada. No existe proveedor de analítica integrado ni recursos opcionales que habilitar.
          El resumen operativo consulta la base de datos.
        </p>
        <p>
          Una integración futura debe identificar servicio, finalidad, recursos y cookies permitidos, versionar la
          elección y permitir aceptar, rechazar y revocar antes de cargar recursos. No se admiten scripts o URLs
          arbitrarios.
        </p>
      </section>
      <TablaDesplazable etiqueta="Datos administrativos">
        <table className="w-full text-left text-sm">
          <caption className="mb-3 text-left font-bold">Almacenamiento técnico necesario</caption>
          <thead>
            <tr>
              <th className="p-3">Elemento</th>
              <th className="p-3">Finalidad</th>
              <th className="p-3">Duración</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="p-3">escenara.session_token</td>
              <td className="p-3">Autenticación</td>
              <td className="p-3">7 días, revocable</td>
            </tr>
            <tr>
              <td className="p-3">escenara.session_data</td>
              <td className="p-3">Copia firmada de sesión para presentación</td>
              <td className="p-3">5 minutos</td>
            </tr>
            <tr>
              <td className="p-3">escenara.account_data</td>
              <td className="p-3">Copia temporal de datos de cuenta según acceso</td>
              <td className="p-3">5 minutos</td>
            </tr>
            <tr>
              <td className="p-3">escenara.dont_remember / escenara.oauth_state</td>
              <td className="p-3">Acceso no persistente / protección del flujo OAuth</td>
              <td className="p-3">Sesión / flujo de acceso</td>
            </tr>
            <tr>
              <td className="p-3">escenara.better-auth-passkey</td>
              <td className="p-3">Desafío para acceso con passkey</td>
              <td className="p-3">5 minutos</td>
            </tr>
            <tr>
              <td className="p-3">escenara-tema (localStorage)</td>
              <td className="p-3">Preferencia claro/oscuro</td>
              <td className="p-3">Hasta cambiarla o borrarla</td>
            </tr>
            <tr>
              <td className="p-3">escenara-aviso-cookies-v1 (localStorage)</td>
              <td className="p-3">Recordar lectura del aviso técnico</td>
              <td className="p-3">180 días</td>
            </tr>
          </tbody>
        </table>
      </TablaDesplazable>
      <p>
        Las cookies técnicas no tienen interruptor de desactivación. «Entendido» solo recuerda la lectura del aviso; no
        autoriza analítica. OAuth/passkeys usan almacenamiento transitorio del flujo de autenticación.
      </p>
      <section className="space-y-3">
        <h2 className="text-xl font-bold">Auditoría y correo</h2>
        <p>
          Lectura limitada a administradores. Solo estados, claves cambiadas, motivo y fecha; sin tokens ni contenido
          del correo. Conservación para revisión manual; no hay eliminación automática activa. Al borrar una cuenta se
          eliminan sus eventos de correo y política y se minimizan los motivos y cambios de auditoría vinculados.
        </p>
      </section>
      <a href="/legal/cookies" className="text-acento">
        Política de cookies →
      </a>
    </PaginaAdmin>
  );
}

import { TablaDesplazable } from "@/components/ui/tabla-desplazable";
