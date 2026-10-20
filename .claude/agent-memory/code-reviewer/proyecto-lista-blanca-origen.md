---
name: proyecto-lista-blanca-origen
description: La lista blanca de origen (demos.ts, comunidad 0.49.0) se burla por input.referencias, por vista_generada declarada y por FKs que pasan a nulo
metadata:
  type: project
---

En la 0.49.0, `condicionDeOrigenSeguro("comunidad")` seguía solo `generation_jobs.source_media_id` (la primera
referencia) y el estado actual de escena y personaje. Reproduje tres «publicable: true» con fotos subidas:
1) referencias 2..n de `input.referencias` sin mirar (51/134 trabajos reales llevan varias);
2) `quitar/añadir referencias` con `generadasConIA` guarda una subida como `origin='vista_generada'`
   (`personajes/servicio.ts`), y la comunidad se fía de esa etiqueta;
3) `source_media_id` y las columnas de escena son `ON DELETE SET NULL` o editables: borrar la subida o vaciar
   `change_only_reference`/canto deja la cadena vacía y el resultado pasa.
Además `input ? 'reparto'` y `input.personajesOmni` solo existen en Omni (0 filas reales).

**Why:** los fixtures escriben `input: {}` y nunca ven la forma real. Relacionado con [[proyecto-fixtures-vs-datos-reales]]
y [[proyecto-medios-publicados-por-admin]].

Segunda ronda (abb3128): la regla ya lee `input` (referencias, lugar, producto, fotogramaSituado, audio), pero Omni con
identidad guarda `referencias: []` + `personajesOmni`, y la cara es la del registro (`character_omni_registrations.
portrait_media_id`), que no se mira: quitar después la subida de la ficha deja el clip publicable. Reproducido con el
registro real de «Elisa» (retrato sin trabajo) en la copia.

Tercera ronda (492e43d): cuenta retrato (left join, nulo = «no») y cuerpo del registro, pero el cuerpo va con
`join … where body_media_id is not null`: borrar definitivamente el cuerpo (FK SET NULL) lo hace desaparecer y el clip
pasa a `true` (reproducido). `remote_body_image_url <> ''` sigue diciendo que hubo cuerpo; la versión registrada
(`character_version_id` → `reference_media_ids`, jsonb sin FK) sobrevive al borrado. Elisa real sí tiene cuerpo subido.

**How to apply:** en cualquier regla de «origen sintético», exige que decida sobre hechos inmutables del trabajo
(todas las ids de medios del `input`, resultado de un trabajo, no `origin`), y trata como desconocido un nulo donde se
esperaba referencia. Prueba siempre: borrar la fuente, vaciar el campo de la escena y referencia no primaria.
