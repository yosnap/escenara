import { index, integer, pgEnum, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { users } from "./esquema-auth";
import { openaiProviders, proveedorCredencial } from "./esquema-boveda";

/**
 * **Mapa de modelos** (0.21.1, decisión firme del propietario): para cada tipo de generación, una **lista
 * ordenada** de con quién se intenta. La primera entrada es la principal; las siguientes son reservas que se
 * prueban solas **solo cuando se ha probado que la anterior no cobró**.
 *
 * Sustituye a las elecciones fijas que había repartidas por el código (el modelo predeterminado del catálogo
 * para el texto, la pareja «ElevenLabs vía KIE → ElevenLabs directo» de la voz, el binario local de la
 * transcripción): todas eran la misma idea escrita tres veces y ninguna se podía cambiar sin tocar el código.
 *
 * Dos clases de fila, en la misma tabla:
 *
 * - `user_id` con valor: el mapa **de esa persona**, que edita en «Tu cuenta»;
 * - `user_id` nulo: la **recomendación de la plataforma**, que pone quien administra. Es lo que se usa —filtrado
 *   por las credenciales que cada uno tenga— mientras el usuario no haya tocado su mapa.
 *
 * `imagen` y `video` ya caben en el modelo de datos, pero todavía no los consulta nadie: el fotograma y el clip
 * siguen eligiendo por el catálogo hasta que ese camino se mueva aquí también.
 */
export const tipoDeMapa = pgEnum("model_map_kind", ["texto", "voz", "transcripcion", "imagen", "video"]);

/**
 * Una entrada del mapa. `provider` reutiliza el enum de la bóveda porque es **con qué credencial se paga**:
 *
 * - `kie`, `google`, `elevenlabs`: la clave del usuario para ese proveedor;
 * - `compatible`: uno de sus servicios compatibles con la API de OpenAI, identificado en `compatible_id`;
 * - `local`: no hay credencial ni coste; hoy solo la transcripción con el binario de la instalación.
 */
export const modelMapEntries = pgTable(
  "model_map_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** `null` en la recomendación de la plataforma. */
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    kind: tipoDeMapa("kind").notNull(),
    /** Orden en que se prueban, empezando por 0. La 0 es la principal. */
    position: integer("position").notNull(),
    provider: proveedorCredencial("provider").notNull(),
    /** Servicio compatible concreto cuando `provider` es `compatible`; `null` en los demás. */
    compatibleId: uuid("compatible_id").references(() => openaiProviders.id, { onDelete: "cascade" }),
    /** Identificador del modelo en ese proveedor. Vacío en `local`, que no elige modelo. */
    model: text("model").notNull().default(""),
  },
  (t) => [
    // `nulls not distinct` para que la recomendación de la plataforma (usuario nulo) tenga también una sola
    // entrada por posición: sin esto, PostgreSQL consideraría distintas dos filas con el mismo hueco.
    unique("model_map_usuario_tipo_posicion_uq").on(t.userId, t.kind, t.position).nullsNotDistinct(),
    index("model_map_usuario_tipo_idx").on(t.userId, t.kind, t.position),
  ],
);

export type FilaMapa = typeof modelMapEntries.$inferSelect;
