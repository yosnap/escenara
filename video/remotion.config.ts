// Configuración de Remotion: los recursos (voz, mezcla, capturas, logotipos,
// fuentes y tiempos.json) se generan en salida/publico, fuera de git.
import { join } from "node:path";
import { Config } from "@remotion/cli/config";

// VIDEO_SALIDA: misma variable que usan los scripts (ruta absoluta a la carpeta de salida)
Config.setPublicDir(process.env.VIDEO_SALIDA ? join(process.env.VIDEO_SALIDA, "publico") : "./salida/publico");
Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(92);
Config.setOverwriteOutput(true);
Config.setConcurrency(null);
