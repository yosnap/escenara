/** Textos sobre las funciones entregadas, sin prometer acuerdos o certificaciones inexistentes. */
export const DOCUMENTOS_LEGALES = {
  aviso: {
    titulo: "Aviso legal",
    secciones: [
      [
        "El servicio",
        "Esta instalación de Escenara permite crear personajes, imágenes, vídeos y proyectos con los proveedores de IA configurados. El titular identificado en esta página opera el sitio; la licencia del código no convierte a sus contribuidores en operadores de esta instalación.",
      ],
      [
        "Contacto y derechos",
        "Para consultas sobre el servicio, reclamaciones o el uso de tus datos, utiliza el correo del titular. Conservas los derechos sobre el contenido que aportas en la medida en que te correspondan. El código se distribuye bajo AGPL 3.0; esta licencia no concede derechos sobre fotografías, voces, marcas o contenido de otras personas.",
      ],
      [
        "Enlaces externos",
        "La documentación, GitHub y las páginas de proveedores se abren como servicios independientes. Al visitarlos se aplican sus propias políticas. El contador de estrellas se consulta desde el servidor, no desde tu navegador.",
      ],
    ],
  },
  privacidad: {
    titulo: "Política de privacidad",
    secciones: [
      [
        "Responsable y datos",
        "El responsable es el titular de esta instalación, identificado debajo. Tratamos correo, nombre, preferencias, credenciales de acceso, sesiones y datos técnicos de seguridad; también los proyectos, prompts, fotografías, voces, audios y resultados que decides guardar. Las claves de proveedores se almacenan cifradas. No las publicamos en la documentación ni en la comunidad.",
      ],
      [
        "Finalidades y bases",
        "Gestionamos el acceso y ejecutamos las funciones que solicitas para prestar el servicio. Los registros de seguridad permiten proteger cuentas y prevenir abuso. Las declaraciones y autorizaciones de imagen, voz, lugares y audio se recogen en sus flujos específicos; informar sobre privacidad no sustituye esos permisos. La publicación en la comunidad requiere una acción y declaración expresas.",
      ],
      [
        "Proveedores y envíos",
        "Al confirmar una generación, las instrucciones y las referencias necesarias se envían al proveedor elegido: KIE y el proveedor del modelo, Google, ElevenLabs o un servicio compatible que hayas configurado, según la tarea. Retirar personas de una foto envía esa foto con las personas al editor elegido. Las comprobaciones de coherencia pueden enviar imágenes a la percepción elegida y descripciones textuales a TypeSafe; los controles en sombra de afirmaciones, cuando están activados, envían texto con nombres sustituidos. Las escenas con personas reales se excluyen de esos envíos en sombra. Un proveedor puede tratar datos fuera del Espacio Económico Europeo: revisa sus condiciones y la configuración de esta instalación antes de aportar datos sensibles.",
      ],
      [
        "Conservación y supresión",
        "Los proyectos y los medios permanecen mientras mantienes tu cuenta y no los borras. Borrar la cuenta aplica el periodo de gracia indicado en esta página; durante él puedes cancelar y exportar. Los objetos pendientes de eliminación se reintentan y los fallidos requieren atención del operador. Se conservan agregados de gasto sin cuenta ni fecha exacta y pruebas mínimas anónimas de declaraciones. Las copias de seguridad del operador pueden conservar datos hasta su rotación; solicita al titular sus plazos. Los ZIP de portabilidad caducan según el plazo indicado debajo.",
      ],
      [
        "Comunidad y ejemplos",
        "La comunidad, si está activada, muestra a otras cuentas con sesión únicamente publicaciones aprobadas: copia del contenido sintético, título, descripción y firma elegida. No publica tu correo ni tus prompts. Retirar la publicación o borrar el original la oculta. Los ejemplos de plantillas asignados por un administrador pueden mostrarse como demostraciones a los usuarios con sesión que ven el selector.",
      ],
      [
        "Tus derechos",
        "Puedes solicitar acceso, rectificación, supresión, oposición, limitación y portabilidad al correo del titular, y retirar las autorizaciones que hayas otorgado. Cuenta y proyectos ofrecen exportación y borrado; no todo registro es visible desde esas pantallas. Si consideras que el tratamiento vulnera tus derechos, puedes reclamar ante la Agencia Española de Protección de Datos (aepd.es). No se usan evaluaciones automáticas para decidir tu acceso a empleo, crédito u otros derechos equivalentes.",
      ],
      [
        "Administración y correo",
        "Los administradores autorizados pueden consultar el estado de las cuentas, activar o bloquear el acceso, revocar sesiones y configurar topes internos. Los cambios sensibles registran actor, destinatario, motivo, fecha y resultado, sin contraseñas, claves, tokens ni contenido de correos. Los eventos de reenvío distinguen solicitud, aceptación SMTP, fallo e incertidumbre; aceptación no confirma entrega. La conservación se revisa según los plazos configurados por el operador, sin limpieza automática activa. Al eliminar la cuenta se borran sus eventos de correo y política y se minimizan motivos y cambios de la auditoría vinculada.",
      ],
    ],
  },
  cookies: {
    titulo: "Política de cookies",
    secciones: [
      [
        "Solo almacenamiento técnico y preferencias",
        "Esta versión no incorpora cookies de publicidad ni de analítica. Las cookies técnicas permiten el acceso y la seguridad; el tema se guarda solo como preferencia de interfaz. El aviso no es un consentimiento para rastreadores. Puedes volver a abrir la información desde «Configurar cookies», al pie de cualquier página.",
      ],
      [
        "Cookies de acceso",
        "escenara.session_token identifica la sesión: hasta siete días, renovable al usar la aplicación. escenara.session_data contiene una copia firmada de la sesión durante cinco minutos; ese plazo no cierra la sesión. Según el flujo de acceso, escenara.account_data puede conservar datos de cuenta durante cinco minutos, escenara.dont_remember indica un acceso no persistente y escenara.oauth_state protege el inicio con un proveedor externo durante ese flujo. escenara.better-auth-passkey guarda el desafío de acceso con passkey durante cinco minutos. En HTTPS los nombres pueden empezar por __Secure-. Las cookies de acceso no son legibles por scripts del navegador y se envían protegidas por HTTPS en producción.",
      ],
      [
        "Almacenamiento local",
        "escenara-tema recuerda el modo claro u oscuro que eliges, hasta que lo cambias, seleccionas sistema o borras el almacenamiento. escenara-aviso-cookies-v1 recuerda durante 180 días que has leído este aviso; no guarda tu identidad ni habilita publicidad. Se guarda en localStorage, no como cookie. Si tu navegador bloquea ese almacenamiento, el aviso puede reaparecer.",
      ],
      [
        "Gestionar y borrar",
        "Puedes bloquear o eliminar cookies y almacenamiento local en los ajustes de tu navegador. Borrar las cookies de acceso cierra la sesión; borrar las preferencias restaura el tema y el aviso. No existe una categoría opcional que debas aceptar para generar. Si esta instalación incorpora en el futuro analítica o publicidad, deberá informar y obtener la elección correspondiente antes de activarlas.",
      ],
    ],
  },
  terminos: {
    titulo: "Términos de uso",
    secciones: [
      [
        "Cuenta y uso",
        "Utiliza una cuenta propia, protege tus credenciales y aporta únicamente contenido que tengas derecho a usar. Esta instalación no está destinada a que menores aporten su imagen o voz. Quien administra puede limitar el registro, los modelos y el presupuesto disponible.",
      ],
      [
        "Generaciones y costes",
        "Escenara muestra la estimación antes de enviar una generación. El proveedor cobra en la cuenta asociada a tu clave y determina el precio final. Los límites de Escenara no son un monedero. Un envío puede haberse cobrado aunque tarde o falle; no repitas una petición cuyo estado sea incierto sin comprobar su historial. El montaje local no consume créditos de generación, aunque usa recursos del servidor.",
      ],
      [
        "Calidad y revisión",
        "Los resultados pueden contener errores visuales, cambios de identidad o afirmaciones inexactas. Revisa cada resultado antes de usarlo, especialmente publicidad, información sensible y referencias a productos. Las comprobaciones automáticas ayudan a revisar; no certifican la veracidad ni los derechos del contenido.",
      ],
      [
        "Publicación y derechos",
        "Crear o exportar no publica automáticamente en redes. Debes disponer de autorizaciones y respetar las condiciones del proveedor y de la plataforma donde publiques. La etiqueta de contenido generado con IA se mantiene en las exportaciones; también debes realizar las declaraciones que pida la plataforma. No se garantiza exclusividad ni protección jurídica de un resultado generado.",
      ],
      [
        "Disponibilidad y contacto",
        "El servicio está en desarrollo y puede requerir mantenimiento. Los trabajos enviados siguen en la cola al cerrar el navegador, pero un proveedor externo puede no completarlos. Para incidencias o reclamaciones contacta con el titular. Estas condiciones no limitan derechos imperativos que te correspondan.",
      ],
    ],
  },
  contenido: {
    titulo: "Uso de imagen, voz y contenido generado con IA",
    secciones: [
      [
        "Personas y autorizaciones",
        "No uses la imagen o voz de alguien sin la autorización adecuada al fin previsto. Para una persona real, completa las declaraciones del flujo y limita el uso a su alcance; el permiso para una foto no autoriza por sí solo un anuncio o una voz sintética. No aportes menores ni material que vulnere intimidad o derechos de terceros.",
      ],
      [
        "Personajes inventados, mascotas y lugares",
        "Declara como inventado solo lo que sea realmente sintético. Una foto subida no se convierte en contenido inventado por marcar una casilla. Las referencias de lugares requieren derechos sobre las fotos y el permiso del interior cuando corresponda; no se admiten menores ni personas reconocibles en las referencias declaradas. Retirar personas mediante IA no verifica por sí mismo esos derechos.",
      ],
      [
        "Audio y publicidad",
        "Para canto o audio propio, declara si el audio es tuyo o tienes licencia suficiente; la declaración no verifica la licencia. No inventes afirmaciones de salud, resultados garantizados o cualidades de un producto. Identifica la publicidad cuando corresponda y conserva las fuentes y autorizaciones.",
      ],
      [
        "Usos prohibidos y avisos",
        "No uses el servicio para suplantación engañosa, acoso, contenido sexual no consentido, explotación de menores, fraude o infracción de derechos. La comunidad requiere moderación y procedencia sintética comprobable. Para notificar contenido que vulnere tus derechos, escribe al titular indicando el contenido, su ubicación y el motivo, sin aportar datos personales innecesarios.",
      ],
      [
        "Transparencia",
        "Las exportaciones incorporan «Contenido generado con IA». La etiqueta visible no certifica un cumplimiento integral de la normativa ni sustituye los avisos exigidos por la plataforma donde publiques.",
      ],
    ],
  },
} as const;
export type DocumentoLegal = keyof typeof DOCUMENTOS_LEGALES;
export const esDocumentoLegal = (valor: string): valor is DocumentoLegal => Object.hasOwn(DOCUMENTOS_LEGALES, valor);
