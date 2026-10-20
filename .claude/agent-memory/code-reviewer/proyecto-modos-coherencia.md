---
name: proyecto-modos-coherencia
description: En Escenara el modo sombra/activa de coherencia apenas cambia comportamiento; el parecido decide la cobertura en ambos modos y `decide` no se lee
metadata:
  type: project
---

A 2026-09-30 (revisión 0.32.2): el parecido (`identidad`) escribe `identityVerdict` en sombra y en Activa, y la cobertura lo lee sin mirar el modo; el campo `ResultadoDecision.decide` no tiene consumidores. Los textos del admin y de las guías («en sombra no decide») no lo reflejan.

**Why:** los textos de coherencia se han corregido varias veces «para que digan la verdad» y siguen chocando con este detalle.

**How to apply:** al revisar cualquier texto sobre modos de coherencia, comprobar primero `server/coherencia/identidad.ts` (escritura del veredicto) y `lib/captura-personaje.ts` (`calcularCobertura`); verificar si ya se ha corregido antes de repetir el hallazgo.
