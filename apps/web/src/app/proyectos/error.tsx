"use client";

/** Los proyectos (lista, guion, producción, revisión y voz): si fallan al pintarse, la causa y cómo seguir. */
// El mismo componente que la pantalla de error de la raíz: reexportarlo hace que el navegador lo descargue una sola vez
// aunque haya varios límites de error en la ruta.
export { default } from "@/app/error";
