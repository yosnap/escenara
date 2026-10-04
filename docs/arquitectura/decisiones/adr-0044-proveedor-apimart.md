# ADR-0044 · APIMart como proveedor BYOK: facturación por segundo y referencias por URL pública firmada

- **Estado:** Aceptada para 0.52.0 (decisión del propietario 2026-10-04, tras el spike
  `spike-261004-2325-apimart-bateria.md`).
- **Versión:** 0.52.0
- **Fecha:** 2026-10-04

## Contexto

El spike midió APIMart con dinero real y las mismas entradas que la comparativa KIE del 2026-09-27: gana en precio
en las cuatro capacidades medidas (clip con voz 8,6×, imagen 2,4×, escena hablada 1,6×, b-roll a paridad) y la
calidad pasó la revisión visual del propietario. El propietario decidió añadirlo **como proveedor más, no como
principal**: cada usuario decide entrando su clave en «Tu cuenta» y eligiendo los modelos en el mapa de modelos, que
ya existe y no cambia.

Tres propiedades del proveedor son nuevas para Escenara y cada una obliga a una decisión:

1. **No sube imágenes ni audios**: solo acepta `http/https` público (o `asset://`, exclusivo de avatares de
   Seedance). No hay endpoint de subida y no acepta base64 (verificado con 400). KIE, en cambio, sube la
   referencia a su almacenamiento temporal (`subirReferencia` del contrato) y devuelve una URL pública.
2. **Factura por segundo con preautorización** y liquida por uso real; **los fallos no cobran** (verificado: un
   envío inválido no movió el saldo). El status de la tarea trae `credits_cost` y `cost` en USD: la conciliación de
   ADR-0016 es directa, sin adivinar.
3. **1 crédito = 0,10 $** (verificado: `cost 0,07 $` con `credits_cost 0,7`), distinto del 0,005 $ de KIE. El
   catálogo guarda créditos por proveedor, así que cada precio se registra en créditos APIMart con su fuente.

## Opciones

Para las referencias:

1. **Subir la imagen a un host temporal** (0x0.st o similar). Funciona, pero la foto del personaje —que es
   personal y a veces de una persona real con consentimiento— pasa por un tercero que no es el proveedor. La
   regla de privacía del proyecto lo descarta.
2. **Servir el medio por la API de la aplicación** (`/api/media/…`). Hoy exige autenticación y en local apunta a
   localhost; en autoalojado exigiría un token de solo lectura nuevo, con su superficie de ataque y su ADR.
3. **URL pública firmada del almacenamiento** (GET con expiración de 50 min contra un endpoint público del
   proveedor S3). No hay subida: el proveedor descarga y listo. La URL no se puede adivinar (firma HMAC con la
   clave secreta), no dura más de lo que tarda una generación y el secreto nunca sale del servidor. Siendo el
   almacenamiento el proveedor de datos del proyecto (seaweedfs local o S3 real), «publicar» la firma es una
   configuración de esa instalación, no una dependencia nueva.

## Decisión

**Opción 3.** El contrato ADR-0015 gana un campo **opcional** en `PeticionReferencia`:
`claveAlmacenamiento` (la clave S3 del medio). El despachador la rellena siempre que la tiene; **solo** el
adaptador de APIMart la usa, firmando una URL GET de 50 min contra `S3_ENDPOINT_PUBLIC` (variable opcional; sin
ella, la instalación falla con un mensaje claro y sin gasto, igual que una instalación sin endpoint público).
Los demás adaptadores ignoran el campo: subir como lo hacen hoy. Si algún día otro proveedor no tuviera subida,
reutiliza el mismo campo sin tocar el contrato otra vez.

- El adaptador `apimart` implementa el contrato completo con vídeo e imagen (tareas asíncronas
  `POST /v1/videos/generations` y `POST /v1/images/generations`, consulta `GET /v1/tasks/{id}`) y **no**
  implementa voz, texto ni omni (el proveedor no los expone igual que KIE): sus modelos no pueden usarse para
  nada de eso, y `sabeMontar` responde `false` a los modelos sin constructor.
- Catálogo: proveedor `apimart` con **solo los modelos medidos** en el spike, estado `validado` y precio medido
  (2026-10-04): `gemini-omni-1.1-flash-ext` (6 s, 720p, 3 cr), `veo3.1-lite-ext` (8 s, 720p, 0,7 cr),
  `MiniMax-Hailuo-2.3-Fast` (6 s, 768p, 1,488 cr) y `gpt-image-2.5-flare` (1K 9:16, 0,1253 cr). Todos con
  `predeterminado: false`: no se cambia el predeterminado de KIE de ninguna capacidad, que era la condición del
  propietario.
- Bóveda: tarjeta `apimart` en «Tu cuenta» y prueba sin coste con `GET /v1/balance` (devuelve el consumo de la
  clave; `success: true` con números la confirma). Se guarda el código propio y nunca el texto del proveedor.
- Conciliación (ADR-0016): el apunte de gasto usa `credits_cost` del status y la revisión lo compara contra la
  caída de saldo (`/v1/user/balance`); el `cost` en USD del status queda registrado como dato de auditoría.
- Pollo queda **descartado** como proveedor (su API a 0,06 $/cr es la cara de las tres en todo lo medido) y
  reservado solo a la hipótesis «suscripción del propietario por catálogo de modelos extra», que no está probada
  y no entra sin su propio spike.

## Consecuencias

- Una instalación sin endpoint S3 público no puede usar APIMart (error claro al generar, sin gasto); KIE sigue
  funcionando igual porque sube las referencias.
- La firma pública de 50 min existe desde hoy: quien vea la URL en un registro de APIMart podría bajar la imagen
  dentro de esa ventana. Es un riesgo aceptado y proporcional: es lo que de hecho necesita el proveedor, es un
  recurso personal del usuario y la ventana es mínima.
- El diálogo de los modelos de voz de APIMart viaja **en el prompt** (como el omni de KIE), no traducido ni
  separado: es lo que el spike verificó en español.
