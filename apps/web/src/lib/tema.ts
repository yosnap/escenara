export type PreferenciaTema = "system" | "light" | "dark";

export const CLAVE_TEMA = "escenara-tema";

/**
 * Script que se ejecuta en <head> antes de pintar y evita el destello. Con sesión, el servidor ya puso
 * la preferencia del usuario (`data-tema-usuario`), que manda y se copia a este navegador; sin sesión se
 * usa la guardada aquí. Sin preferencia (o "system") no hay atributo y manda prefers-color-scheme.
 */
export const SCRIPT_TEMA = `(function(){try{var r=document.documentElement,u=r.dataset.temaUsuario;if(u){if(u==="light"||u==="dark")localStorage.setItem("${CLAVE_TEMA}",u);else localStorage.removeItem("${CLAVE_TEMA}");return;}var t=localStorage.getItem("${CLAVE_TEMA}");if(t==="light"||t==="dark")r.dataset.theme=t;}catch(e){}})();`;

export function aplicarTema(preferencia: PreferenciaTema): void {
  const raiz = document.documentElement;
  if (preferencia === "system") delete raiz.dataset.theme;
  else raiz.dataset.theme = preferencia;
  // Con sesión, la preferencia también es del usuario: se guarda en su cuenta (ver SelectorTema).
  if (raiz.dataset.temaUsuario !== undefined) raiz.dataset.temaUsuario = preferencia;
  try {
    if (preferencia === "system") localStorage.removeItem(CLAVE_TEMA);
    else localStorage.setItem(CLAVE_TEMA, preferencia);
  } catch {
    // Almacenamiento no disponible (modo privado): el tema se aplica solo en esta visita.
  }
}

export function leerPreferencia(): PreferenciaTema {
  const deUsuario = document.documentElement.dataset.temaUsuario;
  if (deUsuario === "light" || deUsuario === "dark" || deUsuario === "system") return deUsuario;
  try {
    const t = localStorage.getItem(CLAVE_TEMA);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}
