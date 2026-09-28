# ADR-0026 · Mapa de modelos por tipo de generación

- **Estado**: aceptada
- **Fecha**: 2026-09-28
- **Versión**: 0.21.1
- **Relacionadas**: ADR-0005 (bóveda de credenciales), ADR-0009 (proveedor inicial), ADR-0015 (contrato de adaptadores), ADR-0020 (traducción de prompts), ADR-0025 (voz del proyecto y transcripción local)

## Addendum 0.22.0 · imagen y vídeo entran en el mapa

Desde la 0.22.0 el mapa cubre **los cinco tipos**: imagen y vídeo dejan de salir del catálogo de la instalación y
los elige y ordena cada usuario, con quien administra recomendando. Lo que **no** cambia es nada de lo decidido
aquí: la regla de dinero del recorrido manda sobre el orden, los créditos de dos proveedores no se comparan ni se
suman, y sin precio registrado no se estima ni se gasta.

Tres precisiones que añade esa ampliación:

- **el vídeo tiene dos capacidades en el mismo apartado** (`image_to_video` y `text_to_video`): un clip normal
  sale de un fotograma y una escena hablada de Gemini Omni no parte de ninguna imagen. Separarlas obligaría a
  ordenar dos veces lo mismo;
- **los servicios compatibles con la API de OpenAI no entran** en imagen ni en vídeo: no saben hacerlo;
- **una reserva del mismo proveedor no se prueba** tras un rechazo probado. Los tres códigos que prueban que no
  hubo cobro son de la cuenta (clave rechazada, sin saldo, exceso de ritmo), así que otro modelo suyo repetiría
  el mismo rechazo y retrasaría el mensaje al usuario;
- cuando el usuario **elige modelo a mano** en «Crear», manda su elección para ese envío y no hay reservas: no ha
  visto el coste de ninguna otra.

## Contexto

Hasta la 0.21.0, **con qué se generaba cada cosa** estaba decidido en tres sitios distintos y ninguno se podía
cambiar sin tocar el código:

- el **texto** (traducción de prompts y asistente de guion) usaba el modelo `text_generation` predeterminado del
  catálogo de la instalación;
- la **voz** usaba una pareja fija escrita en `voz/eleccion.ts`: el modelo de ElevenLabs del «market» de KIE y,
  de reserva, ElevenLabs directo;
- los **subtítulos** usaban siempre el binario local de `whisper.cpp`.

Eran tres veces la misma idea —una lista ordenada de con quién intentarlo— escrita de tres formas. Y las tres se
rompían igual de mal: el 2026-09-28 el modelo de texto de KIE dejó de responder (120 s sin contestar) y con él
se caían la traducción de prompts y el asistente de guion, sin ninguna forma de decirle a la aplicación «usa
otra cosa». El usuario solo veía «no se ha podido, vuelve a intentarlo».

## Decisión

**Una sola estructura: el mapa de modelos.** Para cada tipo de generación (`texto`, `voz`, `transcripcion`, y
`imagen` y `video` reservados para más adelante), **una lista ordenada** de entradas. La primera es la
principal; las siguientes son reservas que se prueban solas.

Cada entrada dice **con qué credencial se paga**:

- `kie`, `google`, `elevenlabs`: la clave del usuario para ese proveedor, más un modelo del catálogo;
- `compatible`: uno de los servicios **compatibles con la API de OpenAI** que el propio usuario da de alta en
  «Tu cuenta» (nombre, dirección base, clave y lista ordenada de modelos);
- `local`: la propia máquina, sin clave y sin coste. Hoy solo los subtítulos.

El mapa es **de cada usuario** y lo edita en «Tu cuenta». Quien administra publica una **recomendación de la
plataforma** en Admin › Modelos, que es lo que se usa —filtrado por las credenciales que cada uno tenga—
mientras el usuario no haya tocado el suyo. Sin recomendación escrita, el orden se deduce del catálogo (el
modelo predeterminado de cada capacidad primero), de modo que una instalación recién migrada se comporta
**exactamente igual que antes de que el mapa existiera**.

**Excepción en `texto`** (propietario, 2026-09-28): sin mapa propio, los modelos de los servicios compatibles del
usuario van **delante** de la recomendación, en el orden en que los dio de alta. Suelen cobrar por cuota de plan
y no por llamada, y usar el modelo de texto de pago de la plataforma para cada traducción teniéndolos es gastar
sin necesidad; así el de pago queda como última reserva.

### La regla de dinero, que manda sobre el recorrido

Se pasa a la siguiente entrada **solo cuando se ha probado que la anterior no cobró**. Es la lista blanca de
siempre (`ErrorProveedor.rechazoProbado`): credencial rechazada, cuenta sin saldo y exceso de ritmo prueban que
no hubo tarea; un 5xx, un tiempo agotado, una red caída o una respuesta que no se entiende **no prueban nada**.

Con dos excepciones, y las dos por el mismo motivo —lo que se protege es que nadie pague dos veces por lo mismo,
no que nunca se siga intentando:

1. cuando la entrada que ha fallado **no cobra por petición** sino por cuota del plan, ningún fallo suyo puede
   dejar un cargo;
2. cuando la **siguiente** entrada no cobra por petición, seguir no puede crear un segundo cargo: como mucho
   queda el de la anterior, que ya está apuntado como «no se sabe si cobró».

Lo que nunca pasa: encadenar dos entradas **de pago** cuando no se sabe si la primera cobró.

### Cada coste, en la moneda de su proveedor

Los créditos de KIE, los del plan de ElevenLabs y la cuota de un servicio compatible **no son la misma unidad**:
no se comparan, no se suman y no se convierten entre sí. No hay ninguna equivalencia honesta que registrar,
porque lo que vale un crédito de ElevenLabs depende del plan contratado.

De ahí tres consecuencias concretas:

- lo que se confirma y se aparta es **el precio del proveedor por el que se va a gastar**, en su moneda;
- cada reserva guarda **su propio tope**, también en la suya, y el cambio automático solo procede si lo que
  cuesta allí cabe en ese tope. Si no cabe, no se cambia y se dice por qué;
- el cambio de crédito a euros pasa a ser **por proveedor** (Admin › Ajustes), y los euros consumidos se suman
  de los importes ya apuntados, no multiplicando créditos de distintos proveedores por una sola cifra.

Los proveedores que se pagan por cuota cuentan **0 €** y **0 créditos**: su llamada no tiene precio por
petición, así que inventarle uno sería mentir. Lo que se guarda de ellas son los **tokens** que informan.

### Las voces no son intercambiables

Los identificadores de voz de ElevenLabs (`EXAVITQu4vr4xnSDxMaL`) y los de kokoro (`ef_dora`) no son los mismos.
Una entrada de otra **familia de voces** no puede leer la voz fijada en el proyecto, así que no aplica como
reserva y el mensaje lo dice. Cambiar de familia por su cuenta cambiaría el timbre del personaje a mitad de
proyecto, y eso no lo decide una avería.

## Consecuencias

- Una avería de un proveedor deja de parar el trabajo si el usuario tiene una reserva, y **nunca a cambio de un
  cobro que no haya visto**.
- El fallo, cuando lo hay, se cuenta entero: qué proveedor, qué modelo, con qué causa concreta, si se cobró o no
  se sabe, qué se intentó después y qué puede hacer quien lo lee (norma de errores visibles, 2026-09-28).
- La dirección base de un servicio compatible **la escribe el usuario**, así que es el único proveedor con
  riesgo de SSRF: solo `https`, el host tiene que resolver a IP públicas, la conexión se fija a la IP comprobada
  y no se siguen redirecciones.
- `imagen` y `video` ya caben en el modelo de datos pero todavía no lo consultan: el fotograma y el clip siguen
  eligiendo por el catálogo hasta que ese camino se mueva aquí también.

## Alternativas descartadas

- **Dejarlo en el código, con una reserva fija por tipo.** Es lo que había y no escala: cada proveedor nuevo era
  otra rama en otro fichero, y el usuario no podía elegir nada.
- **Un único modelo por tipo, elegido por quien administra.** No resuelve la avería, y en BYOK el que paga es el
  usuario: decidir por él con qué cuenta se gasta no es una simplificación, es quitarle la decisión.
- **Convertir todos los créditos a una moneda común.** Habría dado una cifra cómoda de comparar y falsa: la
  equivalencia depende del plan de cada usuario y cambiaría sin avisar.
