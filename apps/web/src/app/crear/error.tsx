"use client";

/** «Crear» y su historial: si fallan al pintarse, la causa y cómo seguir. Desde aquí no se envía ningún trabajo. */
// El mismo componente que la pantalla de error de la raíz: reexportarlo hace que el navegador lo descargue una sola vez
// aunque haya varios límites de error en la ruta.
export { default } from "@/app/error";
