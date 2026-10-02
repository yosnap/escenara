export const GRUPOS_ADMIN = [
  {
    nombre: "Administración",
    paginas: [
      ["/admin", "Resumen"],
      ["/admin/usuarios", "Usuarios"],
      ["/admin/consumo", "Generaciones y consumo"],
      ["/admin/trabajos", "Revisión de trabajos"],
      ["/admin/comunidad", "Comunidad"],
      ["/admin/moderacion", "Moderación y retos"],
    ],
  },
  {
    nombre: "Contenido",
    paginas: [
      ["/admin/medios", "Medios"],
      ["/admin/personajes", "Personajes"],
    ],
  },
  {
    nombre: "Modelos y plantillas",
    paginas: [
      ["/admin/modelos", "Modelos"],
      ["/admin/presets", "Presets"],
      ["/admin/plantillas", "Plantillas"],
      ["/admin/coherencia", "Coherencia"],
      ["/admin/decisiones", "Decisiones"],
      ["/admin/calibracion", "Calibración"],
    ],
  },
  {
    nombre: "Configuración",
    paginas: [
      ["/admin/ajustes", "Ajustes"],
      ["/admin/marca", "Marca"],
      ["/admin/privacidad", "Privacidad"],
      ["/admin/componentes", "Componentes"],
      ["/admin/versiones", "Historial"],
    ],
  },
] as const;
