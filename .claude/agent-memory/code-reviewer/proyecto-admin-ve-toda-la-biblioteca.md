---
name: proyecto-admin-ve-toda-la-biblioteca
description: El admin puede leer cualquier medio de cualquier usuario (listado, DTO con URL firmada y archivo); chocará con cualquier promesa de "solo lo ve su dueño"
metadata:
  type: project
---

En Escenara el rol admin lee **cualquier** medio de cualquier usuario: `listarMedios` con
`propietario=todos`, `buscarFila` (usada por `obtenerMedio` y `archivoDeMedio`) y la pantalla
`/admin/medios`. El DTO siempre lleva `url` (URL temporal firmada) y esos accesos no se auditan.

**Why:** viene de la 0.8.0 y es una decisión de producto previa (el admin gestiona la instalación),
pero cada función nueva que guarde datos personales en la biblioteca (fotos de personaje 0.13.0,
documentos de consentimiento) hereda esa visibilidad. Los documentos de la fase 13 (ADR-0017,
`docs/legal/cumplimiento-y-privacidad.md`) afirman lo contrario: "las fotos solo las ve su dueño,
tampoco quien administra" y "cada acceso queda registrado".

**How to apply:** al revisar cualquier cambio que meta datos sensibles en `media`, comprobar si el
texto (ADR, legal, UI) promete privacidad frente al admin; si la promete, exigir el filtro en
`server/media/servicio.ts` o corregir el texto. No dar por resuelta la promesa porque la capa de
personajes sí filtre por dueño.
