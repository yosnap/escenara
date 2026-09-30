import type { Metadata } from "next";
import Link from "next/link";
import { Alerta } from "@/components/ui/alerta";
import { leerAjustes } from "@/server/ajustes";
import { listarSecretos } from "@/server/boveda/secretos";
import { decisionesRecientes, metricasDeLaSombra } from "@/server/decisiones/consulta";
import { MetricasSombra } from "./metricas-sombra";
import { TablaDecisiones } from "./tabla-decisiones";

export const metadata: Metadata = { title: "Decisiones · Admin" };
export const dynamic = "force-dynamic";

/** Días que se miden. Los mismos que el panel de coherencia, para que las cifras se puedan poner al lado. */
const DIAS = 90;
/** Decisiones que se listan. Las últimas: la tabla es para auditar casos, las métricas son para medir. */
const LIMITE = 50;

/**
 * Decisiones del motor y sombra (RF13): cada decisión con su evidencia, y lo que opina la sombra medido contra lo
 * que dicen las personas.
 *
 * Solo para quien administra, y sin el contenido de nadie: ni nombres, ni correos, ni el texto del guion.
 */
export default async function PaginaDecisiones() {
  const [ajustes, secretos, metricas, decisiones] = await Promise.all([
    leerAjustes(),
    listarSecretos(),
    metricasDeLaSombra(DIAS),
    decisionesRecientes(LIMITE),
  ]);
  const conClave = secretos.some((s) => s.clave === "typesafeApiKey");
  const encendida = ajustes.sombraActiva && ajustes.sombraAfirmaciones && ajustes.sombraEncargadoAceptado;

  return (
    <main id="contenido" tabIndex={-1} className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 md:px-8">
      <div>
        <h1 className="text-4xl font-bold text-texto">Decisiones</h1>
        <p className="mt-2 max-w-3xl text-texto-suave">
          Lo que decidió el motor de controles en cada petición, con qué se miró, con qué umbrales y con qué versión de
          las reglas. Al lado, lo que habría opinado Jev en sombra: <strong>no decide nada</strong>, el usuario no lo ve
          y sirve para medir si acertaría antes de darle ningún poder.
        </p>
      </div>

      <Alerta tipo={encendida && conClave ? "info" : "aviso"} titulo="Estado de la sombra" anuncio="ninguno">
        {!encendida
          ? "La sombra está apagada: no se pregunta nada a Jev y no se gasta nada. Las decisiones se siguen registrando igual."
          : conClave
            ? "La sombra está encendida: cada decisión del motor sobre una escena sin personas reales se evalúa también con Jev, sin nombres, en paralelo y sin esperar a su respuesta."
            : "La sombra está encendida, pero esta instalación no tiene guardada la clave de TypeSafe, así que no se evalúa nada. Guárdala en Ajustes › Coherencia."}{" "}
        <Link href="/admin/ajustes" className="font-semibold underline">
          Cambiarlo en Ajustes
        </Link>
      </Alerta>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl font-bold text-texto">Qué tal acierta la sombra</h2>
        <p className="max-w-3xl text-texto-suave">
          Últimos {DIAS} días, con cada escena contada una sola vez por pregunta. Un <strong>falso permiso</strong> es
          una escena que la sombra habría dejado pasar y una persona no; un <strong>bloqueo innecesario</strong>, una
          que habría frenado y una persona dejó pasar. La pregunta de las afirmaciones se mide con lo que la persona
          resolvió sobre las afirmaciones señaladas en el guion (verificar o corregir: había que frenar; descartar: no
          aplicaba). La del resultado se mide con la corrección de su veredicto o la revisión del clip, que la persona
          hace viéndolo: no es una etiqueta independiente.
        </p>
        <Alerta tipo="info" anuncio="ninguno" compacta>
          La confianza de Jev dice cómo de concentrada está su respuesta, <strong>no</strong> cuántas veces acierta. Por
          eso no hay ninguna frontera fija: el umbral de cada pregunta solo ordena la medición y no automatiza nada.
        </Alerta>
        <MetricasSombra metricas={metricas} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl font-bold text-texto">Últimas decisiones</h2>
        {decisiones.length === 0 ? (
          <p className="text-texto-suave">Todavía no hay ninguna decisión registrada.</p>
        ) : (
          <TablaDecisiones decisiones={decisiones} />
        )}
      </section>
    </main>
  );
}
