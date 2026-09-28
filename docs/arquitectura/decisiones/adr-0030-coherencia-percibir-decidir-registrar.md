# ADR-0030 · Coherencia: percibir, decidir, registrar

- **Estado**: aceptada
- **Fecha**: 2026-09-28
- **Versión**: 0.24.0
- **Relacionadas**: ADR-0003 (contrato de decisiones), ADR-0005 (bóveda y secretos), ADR-0016 (reserva y
  conciliación de gasto), ADR-0017 (consentimiento de personajes), ADR-0023 (motor de reglas de controles),
  ADR-0026 (mapa de modelos por tipo), ADR-0027 (personajes inventados)

## Contexto

Hasta la 0.23.x, Escenara sabía comprobar **el archivo** (duración, negros, congelados: 0.20.0) y **los
requisitos** de un envío (credencial, consentimiento, presupuesto: 0.18.0). Lo que no sabía comprobar es si lo
generado **tiene sentido**:

- si una vista generada de un personaje es **la misma persona** que sus fotos. El comentario de
  `lib/captura-personaje.ts` lo decía con todas las letras: en un personaje real una vista generada no cubría
  nunca, «eso cambiará cuando haya verificación de parecido». Mientras tanto, generar una vista que falta costaba
  créditos y seguía sin contar para nada;
- si la escena que se va a pedir **cubre el guion** y lo que el usuario quería. Un guion triste ilustrado con una
  escena alegre pasaba sin que nadie lo notara;
- si el resultado **encaja con lo descrito**, y si la emoción de la cara y de la voz pegan con el tono del guion.

El problema de fondo es que un modelo generativo, preguntado «¿esto encaja?», contesta un párrafo agradable que
hay que analizar sintácticamente, del que no sale ninguna probabilidad y que cambia de forma entre llamadas. Eso
no es una decisión que un programa pueda consumir.

## Decisión

**Tres pasos separados: percibir → decidir → registrar.** Cada uno hace una cosa y la hace donde se hace mejor.

### 1. Percibir

Un modelo multimodal describe **hechos** de lo generado —rasgos de la cara, encuadre, expresión, lo que se dice,
la emoción de la voz, el ambiente sonoro— **sin juzgar nada**. Las instrucciones se lo prohíben expresamente: no
identifica a nadie, no adivina edad ni estado de ánimo, no puntúa.

Va **por el mapa de modelos del usuario** (ADR-0026), limitado a sus servicios compatibles con la API de OpenAI,
que son los únicos que ven y oyen. De ahí salen tres consecuencias que no se negocian:

- se apunta con **0 créditos** y los tokens informados, porque se paga por cuota del plan y no por petición;
- se recorren sus reservas en orden, con la misma regla de lista blanca de siempre;
- **nunca llega a una entrada de pago**: ningún modelo de pago del catálogo admite imagen ni audio, así que
  mandarle una foto sería pagar por una descripción de nada.

De fábrica se prueba primero `gemma4` para imagen y `mimo-v2.5` para audio (NaN builders), configurables en
Admin › Ajustes › Coherencia. Si el usuario no los tiene dados de alta, se recorre su mapa tal cual: aquí no se
inventa ninguna entrada que él no haya añadido.

### 2. Decidir

**Jev** (TypeSafe, `POST /v1/systemone`) responde una **pregunta tipada** sobre esos hechos y devuelve una
distribución de probabilidades y una **confianza**. Jev solo lee texto, y por eso va siempre detrás de la
percepción: es ella la que convierte una cara o una voz en algo que él pueda leer.

Una primitiva por comprobación, y cada una por su motivo:

| Comprobación | Primitiva | Por qué |
|---|---|---|
| identidad | `noul` | La pregunta es literalmente de sí o no, y lo que interesa es la probabilidad del sí. |
| guion, resultado | `score` | «Cubre el guion» tiene grados; con una escala ordenada se sube el listón cambiando un umbral, no la pregunta. |
| emoción | `choice` | Las respuestas útiles son categorías (coincide, parecida, neutra, opuesta) y se quiere su distribución. |

Las tres se normalizan **en un solo sitio** a dos números: cuánto encaja (0–1) y cuánta confianza hay.

**La confianza enruta el veredicto** (patrón *confidence-gated routing* de TypeSafe): por debajo del umbral de la
instalación el veredicto es `revisar` —«míralo tú»— y **no decide nada**, pase lo que pase con la respuesta. El
umbral es **por comprobación** y no hay ninguna frontera universal: el PRD (§9) ya avisa de que tomar la confianza
por una tasa de acierto es el error clásico, y este ADR lo repite porque es la confusión que más daño haría aquí.

**Laya** (autoalojado) no entra en esta versión: sin datos etiquetados no hay con qué evaluarla. Cabe detrás del
mismo contrato de `server/decisiones/` cuando el panel de acierto tenga muestra.

### 3. Registrar

Cada decisión guarda hechos, respuesta, distribución, confianza, umbral, modelo que decidió, modelo que percibió,
versión de las preguntas, tokens y latencia. Sin eso, la 0.24.0 sería un oráculo: algo que dice sí o no y de lo
que nadie puede decir si acierta.

La **corrección humana** («tiene razón» / «se equivoca») es la única etiqueta de referencia que existe, y de ella
sale el panel de Admin › Coherencia. Con menos de 20 correcciones se enseña el recuento y **no** el porcentaje: un
«100 % de acierto» sobre dos casos es una cifra cómoda y falsa.

### Modo activo y modo sombra

- **Identidad: activa** (propietario, 2026-09-28). Su veredicto decide: una vista generada que pasa **cuenta como
  foto de referencia** de esa vista en un personaje real, y una que no pasa se marca con su motivo y no cuenta.
- **Guion, resultado y emoción: sombra**. Se registran con su evidencia y **no bloquean, no invalidan y no cambian
  la severidad de ninguna escena**. Se enseñan en la pantalla de revisión etiquetadas como lo que son.

El orden importa: primero se mide, después se da poder. Encender una comprobación es una decisión que se toma
mirando el panel de acierto, no al escribir el código.

### Dónde vive la clave de TypeSafe

En los **secretos de la instalación** (ADR-0005), cifrada, no en la bóveda de credenciales del usuario. El motivo
es de producto, no técnico: lo que se comprueba es **una regla de la casa**, no una generación que el usuario ha
pedido y paga con su cuenta. En BYOK el usuario trae la clave de lo que él decide gastar; nadie decide comprobar
su coherencia, así que pedirle una clave más sería cobrarle la política de la plataforma.

De ahí se sigue lo del gasto: **lo que cuesta Jev no entra en el registro de gasto del usuario**. Ese registro es
el dinero del usuario en sus propias cuentas; meter ahí lo que paga el operador inflaría el consumo de alguien que
no lo ha hecho. Se guarda con cada decisión (tokens y euros, con la tarifa de Admin) y se ve agregado en el panel.
La percepción **sí** va al registro del usuario, con 0 créditos: se paga con la cuota de su plan.

### La puerta de privacidad

**La cara de una persona real solo se percibe si su consentimiento lo dice expresamente**
(`consent_records.coherence_declared`, texto en `AVISO_COHERENCIA`).

Comprobar la identidad obliga a mandar **dos fotos suyas** a un servicio que **no es** el que genera. Un
consentimiento firmado para producir vídeo no dice nada de eso, y el precedente de la casa ya iba por ahí: desde la
0.22.1, «Completar la ficha con IA» no envía la cara de una persona real a un servicio de texto, precisamente
porque su consentimiento cubre al proveedor de imagen y vídeo y no a cualquier otro.

Sin esa declaración no se lee ni un byte: la comprobación no se hace, la vista generada se queda `sin_comprobar` y
no cuenta para la cobertura —que es **exactamente** lo que pasaba hasta la 0.23.x—, y la ficha explica qué falta.
Un personaje **inventado** no la necesita: no hay ninguna persona cuya cara salga de ahí.

## Consecuencias

- Un personaje real puede completar su cobertura de vistas **generándolas**, si se parecen. Antes era imposible y
  generarlas era gastar por gusto.
- Una comprobación apagada, o sin clave, o sin servicio que vea, **no rompe nada**: se dice qué falta y todo sigue
  funcionando como en la 0.23.x. Ese es el comportamiento por defecto de esta versión en una instalación que no
  configure nada.
- **Un fallo de Jev nunca decide.** Si la clave falta, si tarda o si contesta algo que no se entiende, no hay
  veredicto y **no se toca** el que hubiera: quitarle la cobertura a alguien por una avería sería peor que no
  comprobar.
- La coherencia **no está en el camino crítico** de ninguna generación. Se pide a mano desde la ficha o desde la
  pantalla de revisión, igual que la revisión con modelo de 0.20.0, para que la lentitud de un servicio de
  comprobación no pueda retrasar nunca lo que el usuario ha pagado.
- Cambiar el texto de una pregunta cambia lo que significa su respuesta, así que las preguntas llevan **versión**
  (`VERSION_PREGUNTAS`) y viven en el código, no en un panel.

## Alternativas descartadas

- **Pedirle el veredicto directamente al modelo multimodal.** Es una llamada menos y una decisión peor: contesta
  prosa, no da probabilidad ni confianza, y la misma pregunta devuelve formas distintas entre llamadas. Separar
  percibir de decidir es lo que hace que la decisión sea auditable: queda escrito **de qué** se decidió.
- **Activar las cuatro comprobaciones desde el primer día.** Sin una sola medida de acierto, sería darle a un
  modelo el poder de bloquear el trabajo de alguien por una corazonada. La sombra cuesta lo mismo y no rompe nada.
- **Un umbral único de 0,8 o 0,9 para todo.** Es la cifra que todo el mundo copia y que nadie ha medido para su
  caso. El umbral es por comprobación y se calibra con el panel.
- **La clave de TypeSafe en la bóveda del usuario (BYOK).** Le haría pagar una comprobación que no ha pedido, y
  dejaría la coherencia apagada para todo el que no diera de alta una clave más.
- **Deducir la autorización de percepción del consentimiento de imagen que ya existe.** Habría ahorrado una casilla
  a costa de mandar la cara de alguien a un servicio que su declaración no nombra. La casilla es opcional
  precisamente para que decir que no deje el producto igual que estaba.
