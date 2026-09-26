export type PreferenciaTema = "system" | "light" | "dark";

export const CLAVE_TEMA = "escenara-tema";

/**
 * Script que se ejecuta en <head> antes de pintar: aplica la preferencia guardada y evita el destello.
 * Sin preferencia (o "system") no se fija atributo y manda prefers-color-scheme.
 */
export const SCRIPT_TEMA = `(function(){try{var t=localStorage.getItem("${CLAVE_TEMA}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t;}catch(e){}})();`;

export function aplicarTema(preferencia: PreferenciaTema): void {
  const raiz = document.documentElement;
  if (preferencia === "system") delete raiz.dataset.theme;
  else raiz.dataset.theme = preferencia;
  try {
    if (preferencia === "system") localStorage.removeItem(CLAVE_TEMA);
    else localStorage.setItem(CLAVE_TEMA, preferencia);
  } catch {
    // Almacenamiento no disponible (modo privado): el tema se aplica solo en esta visita.
  }
}

export function leerPreferencia(): PreferenciaTema {
  try {
    const t = localStorage.getItem(CLAVE_TEMA);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}
