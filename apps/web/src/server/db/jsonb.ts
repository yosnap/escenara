import { sql } from "drizzle-orm";
import { customType } from "drizzle-orm/pg-core";

/**
 * Columna `jsonb` que se guarda de verdad como JSON y no como una cadena con JSON dentro.
 *
 * El `jsonb` de Drizzle está pensado para el controlador de `node-postgres`: su `mapToDriverValue` hace
 * `JSON.stringify(valor)` y deja que el controlador mande ese texto tal cual. `Bun.SQL` no funciona así:
 * un parámetro de tipo cadena destinado a una columna `jsonb` lo codifica **otra vez** como JSON, así que
 * lo que acababa en la base de datos era un `jsonb` de tipo `string` con el JSON dentro
 * (`jsonb_typeof(valor) = 'string'`). La aplicación lo leía bien de casualidad, porque el
 * `mapFromDriverValue` de Drizzle deshace un `JSON.parse` de más; lo que no funcionaba era consultar
 * dentro del valor con los operadores de `jsonb`, que es justo lo que necesitan los presupuestos.
 *
 * Aquí se arregla por los dos lados:
 *
 * - al escribir, el texto JSON viaja como parámetro **de texto** (`::text::jsonb`) y PostgreSQL lo
 *   interpreta como JSON una sola vez. El doble `cast` no es adorno: con `::jsonb` a secas PostgreSQL
 *   deduce que el parámetro ya es `jsonb` y `Bun.SQL` vuelve a codificarlo, que es exactamente el error que
 *   esto arregla. De paso funciona con números y booleanos sueltos, que sin `cast` PostgreSQL intentaría
 *   recibir como `integer` o `boolean`;
 * - al leer no se toca nada: `Bun.SQL` ya devuelve el `jsonb` convertido a valor de JavaScript (objeto,
 *   número, booleano o cadena), y volver a hacer `JSON.parse` sería lo que confunde una cadena guardada
 *   («2048») con un número.
 *
 * La migración `0008` desenvuelve los valores que se guardaron dobles antes de este arreglo.
 */
export const jsonb = <T>(nombre: string) =>
  customType<{ data: T; driverData: unknown }>({
    dataType: () => "jsonb",
    toDriver: (valor) => sql`${JSON.stringify(valor)}::text::jsonb`,
    fromDriver: (valor) => valor as T,
  })(nombre);
