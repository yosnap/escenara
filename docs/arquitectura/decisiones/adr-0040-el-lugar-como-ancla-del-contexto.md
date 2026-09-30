# ADR-0040 · El lugar como ancla del contexto

- **Estado:** Aceptado para 0.46.0 (decisiones provisionales de la fase tomadas como firmes; revisables por el propietario)
- **Fecha:** 2026-09-30
- **Versión del proyecto:** 0.46.0

## Contexto

Los usuarios quieren grabar a la misma persona, o a dos, en **el mismo sitio** una escena tras otra: su calle, su bar,
su patio. Hasta ahora el sitio solo se podía describir (C4 del fotograma, el preset de localización) y el modelo lo
inventaba cada vez: el set de los dos clips de un podcast salía «de la misma familia, no idéntico» (0.28.0). Los sitios
famosos no tienen este problema: el modelo los conoce por su nombre (medido el 2026-09-30).

El spike del 2026-09-30 (173 créditos) midió que un fotograma con la persona y la **foto maestra** del lugar en
`image_urls` reconoce el sitio sin que la persona parezca pegada, que el número de referencias no cambia el precio de la
imagen, que con la misma maestra los dos clips de un podcast salen con el mismo set, que el pixelado de caras se copia
en lo generado y que Omni acepta a la vez `character_ids` e `image_urls`.

## Opciones

1. **Fotos sueltas de la biblioteca elegidas en cada escena.** No hay nada que comparar ni que reutilizar, ni una
   declaración de derechos de la que colgar el uso de un sitio ajeno.
2. **Describir el sitio mejor** (una ficha de texto). El spike de la 0.28.0 ya mostró que así no sale igual.
3. **Una entidad propia, versionada, cuya maestra entra en el fotograma** y el clip parte de él. Falla primero si la
   maestra no cabe en el cupo de referencias del modelo: entonces el lugar viaja descrito y se avisa antes de pagar.

## Decisión

La opción 3:

- **`places`**, del usuario, con fotos que son **relación** con la biblioteca (`place_references`, una sola maestra),
  **versiones** (`place_versions`, cada trabajo guarda `place_version`) y **una declaración de derechos vigente**
  (`place_declarations`); sin ella no se genera. No admite gente reconocible ni menores; la gente reconocible se
  **retira** con una edición de imagen de coste confirmado, nunca se pixela.
- **C4 = el lugar**: con lugar, el contexto del fotograma es el sitio de la maestra y su descripción congelada en la
  versión, y el texto del usuario pasa a significar «dónde, dentro del lugar». El preset de localización no entra.
  Sin lugar, el prompt es idéntico al de antes.
- **El lugar entra por el fotograma** y el clip lo hereda de su imagen de partida. En las escenas habladas de Omni el
  lugar va descrito; combinarlo con el fotograma situado es un ajuste experimental apagado hasta que se escuche la voz.
- **Cupo a tres bandas**: una sola función pura (`lib/reparto-referencias.ts › repartirReferencias`) que usan el aviso,
  el envío y el worker: personaje ≥ 1, producto ≥ 1 si lo hay, la maestra si queda sitio, y el resto 3/7 entre personaje
  y producto como en la 0.35.1.
- **Borrar un lugar conserva la prueba**: sus declaraciones se quedan (`set null` con el nombre del lugar) y el
  trabajo guarda con qué declaración se pidió; no se borra con trabajos en marcha y el worker no envía uno sin lugar.
- **Una sola función decide si la maestra cuenta** (`reparto-del-envio.ts › repartoCompletoDelEnvio`), con las mismas
  entradas en el aviso y en el envío: no en el clip, ni en Omni, ni al meter la captura de un producto digital.
- **Acabados sin mezclar**: un lugar real en un proyecto realista, uno animado del mismo estilo en uno animado.

## Consecuencias

- Se gana un set estable entre escenas y entre los dos clips de un podcast, un sitio que se puede comparar (Jev
  `lugar_fiel`, en sombra) y una declaración con fecha para el uso de sitios ajenos.
- Se pierde un hueco de referencia cuando hay lugar: con modelos de pocas imágenes la maestra se queda fuera y se avisa.
- Queda por revisar: repetir el spike con fotos reales de móvil, escuchar la voz del clip de Omni combinado, la revisión
  jurídica pendiente de la declaración y de la retirada de personas, y el paso de generar el fotograma situado dentro del
  modo Omni.
