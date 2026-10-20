---
name: proyecto-envios-multiples-no-atomicos
description: A/B 0.48.0 — «todo o nada» con comparativa sin lanzar que la toma filtra; historial de huecos en tres revisiones y dónde mirar en envíos de varios trabajos de pago
metadata:
  type: project
---

Primera revisión (2026-09-30): la A/B encolaba uno a uno y cobraba media comparativa; dos A/B a la vez se quedaban con
una cada una; se saltaba los reintentos. Corregido con `comparisons.launched_at/cancelled_at`: la comparativa se guarda
sin lanzar **antes** de encolar, `cola/toma.ts › tomarTrabajos` (único punto de toma) no coge sus trabajos hasta que
está lanzada, y si una no cabe se cancelan las demás. Probado con un worker en paralelo: no sale ninguna sin pareja.

Segunda revisión (mismo día) — lo que quedaba:
- `cancelarLanzamiento` marca `cancelled_at` antes de cancelar trabajos y el barrido solo mira `cancelled_at IS NULL`:
  un fallo a medias o un barrido entre la 1.ª y la 2.ª alternativa deja trabajos `en_cola` para siempre, con reserva
  retenida y la escena bloqueada (reproducible atrasando `created_at` con un trigger y barriendo al ver el 1.er trabajo).
- La UI (`confirmacion-ab.tsx`) reutiliza la clave tras un 409 → bucle «ya se intentó».
- Un clip normal y una A/B a la vez en una escena sin clip salen los tres.
- Borrar la escena a mitad es seguro: `despacho` cierra trabajos con `scene_id` nulo.

Tercera (mismo día): los tres cerrados (barrido reanudable, `encolar` rechaza canceladas, exclusión en ambos sentidos).
Patrón nuevo: al añadir `!X` a una condición `puedeA`, revisa las que dependen de `!puedeA` (`puedePedirOtroClip` se
encendía). Y la UI trata un 504 del proxy como «respuesta del servidor» y estrena clave; hoy lo frena la exclusión
por escena, no la idempotencia.

**Why:** en envíos de varios trabajos de pago, los fallos están en las ventanas entre transacciones y en los barridos.

**How to apply:** en A/B, podcast o lotes, prueba techo para uno, dos peticiones en paralelo, worker en paralelo,
barrido a mitad y cancelación a medias. Relacionado: [[proyecto-candados-encolar]].
