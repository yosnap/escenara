# ADR-0027 · Un personaje inventado no tiene fotos, declara que no representa a nadie y su cara se genera

- **Estado:** propuesto (firme: que exista el personaje inventado; provisionales y pendientes de confirmar: los cuatro retratos candidatos, la lista de nombres reales y que el retrato elegido no cuente como foto original)
- **Fecha:** 2026-09-28
- **Versión del proyecto:** 0.22.0

## Contexto

Escenara existe para generar vídeo con la cara de una persona **con su consentimiento** (RF10, ADR-0009): sin
consentimiento vigente no se genera nada, y las fotos de referencia son lo que da identidad a cada fotograma.

El UGC no siempre necesita una persona real. Quien hace contenido para una marca quiere un presentador que no
existe: nadie a quien pedir permiso, nadie que pueda revocar nada y ningún parecido con alguien concreto. Hasta la
0.21.x eso no se podía hacer sin mentir: había que crear un personaje «soy yo» y darle fotos de alguien, lo que
convierte el consentimiento en un trámite falso.

La tentación fácil es «un personaje sin fotos», pero eso choca con todo lo que sostiene la aplicación: el mínimo
de referencias, la cobertura de vistas, el registro de consentimiento y las puertas del motor de controles
(ADR-0023) están construidas sobre la idea de que un personaje **tiene fotos de alguien**.

## Decisión

Un **personaje inventado** es un tipo propio de personaje, con su propia puerta de entrada y sus propias reglas:

1. **Nace de una descripción y su cara se genera.** Se piden cuatro retratos candidatos con el modelo de imagen del
   mapa —cada uno con su coste estimado, confirmado y reservado, como cualquier otro envío— y el usuario elige uno.
   Los demás quedan pagados en su biblioteca y no se borran.
2. **El retrato elegido se guarda como `vista_generada`, nunca como foto original.** No lo es: lo ha hecho un
   modelo, y la ficha lo dice siempre con su distintivo. De él salen después las demás vistas con el sistema de
   vistas generadas que ya existía (0.14.0).
3. **No admite fotos reales**, ni subidas ni desde la biblioteca. Lo impide el servidor en la única puerta por la
   que entra una foto (`anadirReferencias`), no la interfaz.
4. **Su texto no puede nombrar a personas reales**, ni al crearlo ni al editarlo después. Se comprueba con una
   lista de personas públicas muy conocidas (`lib/nombres-reales.ts`).
5. **No declara mayoría de edad ni sube documento**: no hay ninguna persona cuya edad declarar ni a quien pedir
   permiso. Lo que registra en su lugar, con su cuenta y su fecha, es la declaración de que **es inventado y no
   representa a ninguna persona real**, como un titular de consentimiento propio (`inventado`).
6. **No se le puede registrar un consentimiento normal después.** Si se pudiera, un personaje sin cara real pasaría
   a decir que la tiene con un clic.

Como el primer retrato **es** lo que le da su primera referencia, ese envío concreto se evalúa sin exigirle las
fotos que todavía no tiene —igual que una vista sintética no se frena por el aviso de la vista que viene a
cubrir—. Todo lo demás del motor de controles se le aplica igual: credencial, dinero, cuota y topes.

## Consecuencias

- Se puede hacer UGC sin fingir un consentimiento, que era la alternativa real hasta ahora.
- Un personaje inventado **no cuenta con fotos originales**, así que su estado depende de sus vistas generadas: el
  mínimo de referencias de la instalación se mide sobre fotos originales y un personaje inventado nunca las tiene.
  Es la consecuencia que hay que vigilar al validarlo en el navegador.
- La lista de nombres reales es **un control, no una verificación**: no puede contener a todas las personas del
  mundo, y así se dice en la interfaz. Lo que sostiene la regla es la declaración firmada del usuario. La
  comprobación con el modelo de texto del mapa queda pendiente de medir su coste.
- Lo que genere un personaje inventado es **contenido sintético** y va marcado como tal; recogerlo en la
  exportación es trabajo de la 0.23.0.

## Alternativas descartadas

- **Un personaje normal sin fotos.** Habría que relajar el mínimo de referencias para todos, y con él la puerta que
  impide generar la cara de alguien con una sola foto suelta.
- **Reutilizar el titular «soy yo» con una casilla «es inventado».** Un campo del cuerpo de la petición decidiría
  si se exige o no la declaración de mayoría de edad: la puerta más delicada del producto dependiendo de un
  booleano opcional.
- **Un solo retrato en lugar de cuatro.** Sale más barato, pero un retrato que no convence obliga a repetir el
  gasto entero; con cuatro se elige una vez y las tres imágenes que sobran siguen siendo del usuario.
