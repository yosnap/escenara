/** Valores admitidos en las preferencias del usuario (compartidos por servidor y cliente). */
export const TEMAS = ["system", "light", "dark"] as const;
export const IDIOMAS = ["es", "en"] as const;

export type Tema = (typeof TEMAS)[number];
export type Idioma = (typeof IDIOMAS)[number];

export const ETIQUETA_IDIOMA: Record<Idioma, string> = { es: "Español", en: "English" };
