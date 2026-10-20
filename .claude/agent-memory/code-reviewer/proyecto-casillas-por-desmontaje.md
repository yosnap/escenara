---
name: proyecto-casillas-por-desmontaje
description: En /crear las casillas de consentimiento se reiniciaban por desmontaje del panel; al subir su estado hay que reproducir cada desmontaje
metadata:
  type: project
---

En «Crear», las casillas de derechos, marca y aviso de gasto se reiniciaban **porque su panel se desmontaba** (cambio de camino, clip en marcha), no por una regla explícita. En 0.33.1 subieron a `useConfirmacionCoste(vigente)` en `VistaCrear`, y el fotograma se quedó sin `vigente`, así que dejó de reiniciarse al cambiar de camino.

**Why:** un reinicio implícito por desmontaje desaparece en silencio al subir el estado; es consentimiento, así que es regresión de las que importan.

**How to apply:** en cualquier refactor que suba estado de consentimiento o confirmación, comparar los condicionales de montaje en `develop` con la condición `vigente` nueva, uno por uno. Ver también [[proyecto-modos-coherencia]].
