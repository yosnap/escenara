import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { EJES_VOZ_POR_DEFECTO } from "@/lib/direccion";
import { renderizarPlantilla } from "@/lib/plantillas-prompt";
import type { VariablePlantilla } from "@/lib/presets";
import { type CategoriaDecidible, categoriasDecididasDe } from "@/lib/trends";
import { dirigirClip } from "../direccion/clip";
import { MODO_MUDO, REGLA_ANTI_CORTE } from "../direccion/ingles";
import { REGLA_ETIQUETA_PRODUCTO } from "../direccion/producto";
import { repartirReferencias } from "../productos/referencias";
import semilla from "./presets.json";

const trends = semilla.plantillas.filter((p) => "kind" in p && p.kind === "trend");

describe("formatos de trend sembrados", () => {
  test("hay cinco formatos originales, todos en revisión y sin habla explícita", () => {
    expect(trends).toHaveLength(5);
    for (const trend of trends) {
      expect(trend.nombre).toBeTruthy();
      expect(trend.descripcion).toBeTruthy();
      expect(trend.trendStatus).toBe("revision");
      // La duración de diseño se conserva como dato histórico; lo que limita son las duraciones admitidas, y los
      // sembrados admiten cualquiera.
      expect(trend.targetSeconds).toBe(8);
      expect(trend.duracionesAdmitidas).toEqual([]);
      expect(categoriasDecididasDe(trend.direccionDecidida)).toEqual(trend.direccionDecidida as CategoriaDecidible[]);
      expect("trendAllowsSpeech" in trend && trend.trendAllowsSpeech).not.toBe(true);
      expect(trend.plantilla).not.toMatch(/music track|copyrighted|logo overlay/i);
    }
  });

  test("todos los formatos cierran en toma única y omiten el guion de un clip mudo", () => {
    for (const trend of trends) {
      const render = renderizarPlantilla(trend.plantilla, trend.variables as VariablePlantilla[], {
        escena: "a person in a kitchen handling an object",
      });
      expect(render.motivos).toEqual([]);
      const clip = dirigirClip(
        {
          formato: "ugc_a_camara",
          movimientosCamara: [],
          nivelCamara: "basico",
          plano: "Medium shot",
          angulo: "Eye level",
          registroEstetico: "ugc_real",
          sujeto: "A person",
          personajeReal: false,
          escena: render.texto,
          instruccionesExtra: "",
          modoExperto: false,
          descripcionExperta: "",
          anclajes: "",
          microaccion: "",
          momentoMicroaccion: "durante",
          dialogo: "Este guion no debe llegar al modelo.",
          direccionVocal: "",
          ejesVoz: EJES_VOZ_POR_DEFECTO,
          acento: "es_ES_madrid",
          segundos: 8,
          trend: { permiteHabla: false },
        },
        { dialogoDentro: true },
      );
      expect(clip.dialogo).toBe("");
      expect(clip.escena).not.toContain("Este guion");
      expect(clip.escena).toContain(MODO_MUDO);
      expect(clip.escena.endsWith(REGLA_ANTI_CORTE)).toBe(true);
      expect(clip.escena).toContain((trend.plantilla.split(" {{escena}}")[0] ?? "").slice(0, 20));
    }
  });

  test("el producto viaja como referencia física y conserva su etiqueta", () => {
    const reparto = repartirReferencias(3, 1, 2);
    expect(reparto).toEqual({ personaje: 1, producto: 2, cabenTodas: true });
    const clip = dirigirClip({
      formato: "ugc_a_camara",
      movimientosCamara: [],
      nivelCamara: "basico",
      plano: "Close shot",
      angulo: "Eye level",
      registroEstetico: "ugc_real",
      sujeto: "A person",
      personajeReal: false,
      escena: "The person picks up the jar",
      instruccionesExtra: "",
      modoExperto: false,
      descripcionExperta: "",
      anclajes: "",
      microaccion: "",
      momentoMicroaccion: "durante",
      dialogo: "",
      direccionVocal: "",
      ejesVoz: EJES_VOZ_POR_DEFECTO,
      acento: "es_ES_madrid",
      segundos: 8,
      trend: { permiteHabla: false },
      producto: { descripcion: "a white jar", accion: "held in the hand", soloProducto: false, conReferencias: true },
    });
    expect(clip.escena).toContain("product reference images");
    expect(clip.escena).toContain("Never add a graphic overlay");
    expect(clip.escena.indexOf(REGLA_ETIQUETA_PRODUCTO)).toBeLessThan(clip.escena.indexOf(REGLA_ANTI_CORTE));
  });

  test("la migración que libera los trends existentes decide lo mismo que la semilla, texto por texto", () => {
    // La instalación nueva lo recibe por la semilla y la ya montada por la migración: tienen que coincidir.
    const sql = readFileSync(
      path.resolve(import.meta.dirname, "../../../drizzle/0053_trends-sin-duracion-fija.sql"),
      "utf8",
    );
    const casos = [...sql.matchAll(/WHEN '([^']+)'\s+THEN '(\[[^']*\])'/g)].map((m) => ({
      texto: m[1],
      decide: JSON.parse(m[2] ?? "[]") as string[],
    }));
    expect(casos).toHaveLength(trends.length);
    for (const trend of trends) {
      const caso = casos.find((c) => c.texto === trend.plantilla);
      expect(caso?.decide).toEqual(trend.direccionDecidida);
    }
  });
});
