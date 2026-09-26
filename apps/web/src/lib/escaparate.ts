import type { Tono } from "@/components/ui/creator";

/**
 * Personajes ficticios del escaparate de la portada. Generados con KIE solo a partir de texto
 * (`spikes/prototipo/escaparate.ts`): no representan a ninguna persona real.
 */
export interface EjemploEscaparate {
  id: string;
  personaje: string;
  titulo: string;
  especialidad: string;
  tono: Tono;
  alt: string;
  /** Vídeo animado desde la misma imagen. */
  video?: boolean;
  /** Duración del vídeo, p. ej. «0:04». */
  duracion?: string;
  /** Misma persona que otro ejemplo, en otra escena: muestra que el personaje se mantiene. */
  mismoPersonajeQue?: string;
}

export const EJEMPLOS: EjemploEscaparate[] = [
  {
    id: "lucia",
    personaje: "Lucía",
    titulo: "Miradores al atardecer",
    especialidad: "Turismo y viajes",
    tono: "cian",
    alt: "Lucía, guía de viajes, sonríe en un mirador blanco sobre el mar al atardecer",
    video: true,
    duracion: "0:04",
  },
  {
    id: "lucia-mercado",
    personaje: "Lucía",
    titulo: "Café en el mercado",
    especialidad: "Turismo y viajes",
    tono: "cian",
    alt: "Lucía, con la misma camisa mostaza, pasea por un mercado con un café en la mano",
    mismoPersonajeQue: "lucia",
  },
  {
    id: "nube",
    personaje: "Nube",
    titulo: "Un día en el parque",
    especialidad: "Mascotas",
    tono: "sol",
    alt: "Nube, un golden retriever con pañuelo coral, sentado en la hierba de un parque",
    video: true,
    duracion: "0:04",
  },
  {
    id: "marco",
    personaje: "Marco",
    titulo: "Pasta fresca en 10 minutos",
    especialidad: "Gastronomía",
    tono: "mandarina",
    alt: "Marco, cocinero con delantal azul marino, presenta un plato de pasta con tomate y albahaca",
  },
  {
    id: "aisha",
    personaje: "Aisha",
    titulo: "Estiramientos al amanecer",
    especialidad: "Deporte y bienestar",
    tono: "cobalto",
    alt: "Aisha, entrenadora con ropa deportiva turquesa, estira en un parque al amanecer",
  },
  {
    id: "tomas",
    personaje: "Tomás",
    titulo: "¿Merecen la pena?",
    especialidad: "Producto y comercio",
    tono: "coral",
    alt: "Tomás, con gafas redondas y sudadera cobalto, muestra unos auriculares blancos sin marca",
  },
  {
    id: "sofia",
    personaje: "Sofía",
    titulo: "Rutina de noche",
    especialidad: "Belleza y autocuidado",
    tono: "fucsia",
    alt: "Sofía, de pelo plateado, sostiene un frasco de cristal sin etiqueta en un baño con plantas",
  },
];

export const imagenEjemplo = (id: string) => `/escaparate/${id}.webp`;
export const videoEjemplo = (id: string) => `/escaparate/${id}.mp4`;
