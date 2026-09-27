"use client";

import { Dumbbell, Heart, Palmtree, PawPrint, ShoppingBag, UtensilsCrossed } from "lucide-react";
import { useState } from "react";
import { AnilloHistoria, ChipPreset, Pegatina, TarjetaReel, type Tono } from "@/components/ui/creator";
import { MascotaChispa } from "@/components/ui/mascota";
import { Muestra, Seccion } from "../seccion";

const PRESETS: { id: string; etiqueta: string; tono: Tono; icono: typeof Palmtree }[] = [
  { id: "turismo", etiqueta: "Turismo y viajes", tono: "cian", icono: Palmtree },
  { id: "producto", etiqueta: "Producto", tono: "coral", icono: ShoppingBag },
  { id: "gastronomia", etiqueta: "Gastronomía", tono: "mandarina", icono: UtensilsCrossed },
  { id: "belleza", etiqueta: "Belleza", tono: "fucsia", icono: Heart },
  { id: "deporte", etiqueta: "Deporte", tono: "cobalto", icono: Dumbbell },
  { id: "mascotas", etiqueta: "Mascotas", tono: "sol", icono: PawPrint },
];

export function SeccionCreador() {
  const [activo, setActivo] = useState("turismo");
  return (
    <Seccion
      id="creador"
      titulo="Creador"
      descripcion="Componentes con carácter de app de creadores: color por especialidad, anillos de historia, tarjetas 9:16 y Chispa, la mascota."
    >
      <div className="grid gap-4">
        <Muestra titulo="Chips de preset (uno activo)">
          {PRESETS.map(({ id, etiqueta, tono, icono: Icono }) => (
            <ChipPreset
              key={id}
              etiqueta={etiqueta}
              tono={tono}
              icono={<Icono className="size-5" />}
              activo={activo === id}
              onClick={() => setActivo(id)}
            />
          ))}
        </Muestra>
        <Muestra titulo="Anillos de historia">
          <AnilloHistoria nombre="Lucía" estado="listo" />
          <AnilloHistoria nombre="Toby" estado="faltan-fotos" />
          <AnilloHistoria nombre="Marcos" estado="en-revision" />
          <AnilloHistoria nombre="Sara" estado="bloqueado" />
        </Muestra>
        <Muestra titulo="Tarjetas 9:16 y pegatinas">
          <TarjetaReel
            titulo="Escapada a Cádiz"
            subtitulo="Turismo · Itinerario"
            duracion="0:32"
            tono="cian"
            pegatina={<Pegatina tono="sol">Nuevo</Pegatina>}
          />
          <TarjetaReel
            titulo="Crema solar"
            subtitulo="Producto · Anuncio"
            duracion="0:18"
            tono="coral"
            pegatina={<Pegatina tono="fucsia">Remezcla</Pegatina>}
          />
          <TarjetaReel
            titulo="Toby en la playa"
            subtitulo="Mascotas · Historia"
            duracion="0:24"
            tono="sol"
            pegatina={<Pegatina tono="cian">Reto</Pegatina>}
          />
          <div className="flex flex-col gap-2">
            <Pegatina>Idea</Pegatina>
            <Pegatina tono="cobalto">Nuevo</Pegatina>
            <Pegatina tono="mandarina">Reto de la semana</Pegatina>
          </div>
        </Muestra>
        <Muestra titulo="Chispa, la mascota (saluda · señala · celebra)">
          {(["saluda", "senala", "celebra"] as const).map((e) => (
            <div key={e} className="flex flex-col items-center gap-2">
              <MascotaChispa expresion={e} tamano={88} />
              <span className="text-sm text-texto-suave">
                {{ saluda: "Saluda", senala: "Señala", celebra: "Celebra" }[e]}
              </span>
            </div>
          ))}
        </Muestra>
      </div>
    </Seccion>
  );
}
