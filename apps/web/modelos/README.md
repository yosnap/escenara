# Modelos locales

Modelos que se ejecutan **en el propio servidor**, sin enviar nada a ningún proveedor.

## `yolox-nano.onnx`

- **Para qué:** comprobar que en las fotos de referencia de un personaje de tipo animal no aparece ninguna
  persona (`src/server/vision/personas.ts`). Solo se usa la clase «person» de COCO.
- **Origen:** YOLOX-Nano de Megvii, publicado en
  `https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_nano.onnx`.
- **Licencia:** Apache-2.0 (YOLOX, Megvii Inc.).
- **SHA-256:** `c789161ed43c8269fcd4e67c67eeeb4e80c622da2eb296a20bc6007bd18a0b7d`.
- **Ejecución:** `onnxruntime-web` (MIT) en WebAssembly con un solo hilo: no necesita binarios nativos en la
  imagen de Docker.
