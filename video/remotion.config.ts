// Configuración de Remotion: los recursos (voz, mezcla, capturas, logotipos,
// fuentes y tiempos.json) se generan en salida/publico, fuera de git.
import { Config } from "@remotion/cli/config";

Config.setPublicDir("./salida/publico");
Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(92);
Config.setOverwriteOutput(true);
Config.setConcurrency(null);
