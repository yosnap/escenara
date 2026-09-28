/**
 * Detección de nombres de personas reales en el texto de un personaje inventado (RF10, 0.22.0).
 *
 * Un personaje inventado no puede describirse como «igual que <persona real>»: si pudiera, la declaración de que
 * no representa a nadie sería falsa sin que nadie lo notara, y lo que se enviaría al proveedor sería la cara de
 * alguien que no ha consentido nada.
 *
 * **Es un control, no una verificación**, y así se dice en la interfaz: una lista no puede contener a todas las
 * personas del mundo. La lista atrapa lo que de verdad se intenta (personas muy conocidas), y la comprobación con
 * el modelo de texto del mapa llegará cuando haya una medida de su coste; mientras tanto, lo que sostiene la
 * regla es la declaración firmada del usuario, que queda con su cuenta y su fecha.
 *
 * Función pura y sin estado: la usan igual el servidor, que es quien decide, y la interfaz, que avisa mientras se
 * escribe.
 */

/**
 * Nombres que la lista reconoce. Son personas públicas muy conocidas de varios ámbitos (política, cine, música,
 * deporte, tecnología). Se guardan **en minúsculas y sin acentos**, que es como se comparan.
 *
 * La lista es corta a propósito: alargarla con nombres comunes («Ana García») convertiría el control en un
 * rechazo constante de descripciones legítimas, que es la forma más rápida de que alguien deje de leerlo.
 */
const NOMBRES: readonly string[] = [
  "barack obama",
  "donald trump",
  "joe biden",
  "kamala harris",
  "vladimir putin",
  "angela merkel",
  "emmanuel macron",
  "pedro sanchez",
  "felipe vi",
  "letizia ortiz",
  "elon musk",
  "jeff bezos",
  "bill gates",
  "mark zuckerberg",
  "steve jobs",
  "sam altman",
  "taylor swift",
  "beyonce",
  "rosalia",
  "bad bunny",
  "shakira",
  "madonna",
  "lady gaga",
  "michael jackson",
  "leo messi",
  "lionel messi",
  "cristiano ronaldo",
  "rafa nadal",
  "rafael nadal",
  "lebron james",
  "brad pitt",
  "angelina jolie",
  "tom cruise",
  "scarlett johansson",
  "leonardo dicaprio",
  "keanu reeves",
  "penelope cruz",
  "javier bardem",
  "antonio banderas",
  "pedro almodovar",
  "emma watson",
  "dwayne johnson",
  "margot robbie",
  "zendaya",
  "papa francisco",
  "dalai lama",
];

/** Minúsculas y sin acentos ni signos: comparar «Peñélope» y «penelope» tiene que dar lo mismo. */
const normalizar = (texto: string): string =>
  texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Nombres de personas reales que aparecen en el texto, en el orden de la lista y sin repetir. Vacío = el texto no
 * nombra a nadie que esta lista conozca.
 *
 * Se compara con los límites de palabra ya normalizados, así que «Shakira» se detecta y «shakiras» no dispara por
 * coincidir a medias dentro de otra palabra.
 */
export function nombresRealesEn(texto: string): string[] {
  const limpio = ` ${normalizar(texto)} `;
  if (limpio.trim() === "") return [];
  return NOMBRES.filter((nombre) => limpio.includes(` ${nombre} `));
}

/** `true` si el texto nombra a alguien de la lista. */
export const nombraAPersonaReal = (texto: string): boolean => nombresRealesEn(texto).length > 0;

/** Mensaje con el que se rechaza, diciendo **qué** nombre se ha encontrado y qué hacer. */
export function motivoNombreReal(nombres: readonly string[]): string {
  const lista = nombres.map((n) => n.replace(/\b\w/g, (c) => c.toUpperCase())).join(", ");
  return `El texto de un personaje inventado no puede nombrar a personas reales, y aquí aparece ${lista}. Descríbelo por su aspecto (edad, pelo, complexión, ropa) en lugar de por su parecido con alguien.`;
}
