---
name: proyecto-fixtures-vs-datos-reales
description: Los fixtures de integración escriben generation_jobs.input a mano y pueden no coincidir con lo que guarda el motor; contrastar con una copia de datos reales
metadata:
  type: project
---

En la 0.35.0 el servicio de conversión leía `input.segundos`, y el fixture del test lo ponía ahí, pero el motor guarda la
duración en `input.parametros.segundos`. El test pasaba y en los datos reales todo proyecto convertido nacía con 8 s.

**Why:** los tests de integración insertan filas de `generation_jobs` a mano con la forma que cree el implementador, no
con la que escribe `generacion/servicio.ts`, así que un «verde» no prueba que se lea el campo correcto.

**How to apply:** cuando un cambio lea claves del JSON `input` (u otro jsonb), consulta la copia de datos reales
(`escenara_rev*` restaurada con pg_dump, ver [[proyecto-tests-integracion]]) con `jsonb_object_keys(input)` antes de
aceptar el test.
