---
name: proyecto-medios-publicados-por-admin
description: Rutas que publican un medio elegido por el admin a todos los usuarios (demo de plantillas 0.42.1) — comprobar propiedad del medio y consentimiento de personajes
metadata:
  type: project
---

En 0.42.1, `exigirMedioParaDemo` validaba tipo, papelera y `condicionMedioNoReservado()`, pero no `media.ownerId`: un administrador podía publicar el medio privado de cualquier usuario (reproducido: la acción responde ACEPTADO y otro usuario recibe 200). `condicionMedioNoReservado` tampoco excluye los resultados generados con un personaje (`generation_jobs.character_id` + `result_media_id`).

**Why:** el selector de la interfaz solo enseña la biblioteca propia, así que el fallo no se ve desde el navegador. Solo sale llamando a la acción con un UUID ajeno. Relacionado con [[proyecto-admin-ve-toda-la-biblioteca]].

Segunda revisión (1afe6a7): propiedad cerrada (`demo_set_by` comparado con `owner_id` al servir). `condicionSinPersonajeReal()` seguía dejando pasar: versiones anteriores de escena con reparto real cuando `generation_jobs.character_id` es el inventado (el dualcast guarda uno solo; los dos van en `input.personajesOmni`), clips cuyo personaje real se quitó del reparto después, y fotos originales quitadas de un personaje (siguen en `character_versions.reference_media_ids`, pero no en `character_references`). Buscar «personaje real» mirando solo `character_id` o el reparto actual no basta.

**How to apply:** en cualquier función que haga visible a otros usuarios un medio elegido por el admin (ejemplos, marca, portada…), exigir la propiedad o un criterio explícito y preguntar por los clips hechos con personajes. Para probarlo con BD y S3 propios: clúster PG18 (el servidor es 18; pg_dump 14 falla), `-k ''` porque la ruta del socket del scratchpad pasa de 103 bytes, y un S3 simulado mínimo con Bun.serve (PUT/GET con Range/HEAD/DELETE) basta para la suite completa.
