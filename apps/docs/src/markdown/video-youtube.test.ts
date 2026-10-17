import { describe, expect, test } from "bun:test";
import { esEnlaceDeYoutube, idDeYoutube, urlDeInsercion } from "./video-youtube";

describe("idDeYoutube", () => {
  test("reconoce las formas habituales del enlace", () => {
    expect(idDeYoutube("https://youtu.be/TGQNtzKzOlM")).toBe("TGQNtzKzOlM");
    expect(idDeYoutube("https://youtu.be/TGQNtzKzOlM?si=abc")).toBe("TGQNtzKzOlM");
    expect(idDeYoutube("https://www.youtube.com/watch?v=TGQNtzKzOlM&list=PL1")).toBe("TGQNtzKzOlM");
    expect(idDeYoutube("https://youtube.com/shorts/TGQNtzKzOlM")).toBe("TGQNtzKzOlM");
    expect(idDeYoutube("https://www.youtube-nocookie.com/embed/TGQNtzKzOlM")).toBe("TGQNtzKzOlM");
  });

  test("rechaza ids mal formados y dominios que no son de YouTube", () => {
    expect(idDeYoutube("https://youtu.be/corto")).toBeNull();
    expect(idDeYoutube("https://youtu.be/TGQNtzKzOlM/extra")).toBeNull();
    expect(idDeYoutube('https://www.youtube.com/watch?v=TGQNtzK"><x')).toBeNull();
    expect(idDeYoutube("https://www.youtube.com/channel/TGQNtzKzOlM")).toBeNull();
    expect(idDeYoutube("https://youtube.com.ejemplo.com/watch?v=TGQNtzKzOlM")).toBeNull();
    expect(idDeYoutube("javascript:alert(1)")).toBeNull();
    expect(esEnlaceDeYoutube("../assets/video/a.webp")).toBeFalse();
  });
});

describe("urlDeInsercion", () => {
  test("usa youtube-nocookie y solo reproduce solo si se pide", () => {
    expect(urlDeInsercion("TGQNtzKzOlM")).toBe("https://www.youtube-nocookie.com/embed/TGQNtzKzOlM?rel=0");
    expect(urlDeInsercion("TGQNtzKzOlM", { autoplay: true })).toBe(
      "https://www.youtube-nocookie.com/embed/TGQNtzKzOlM?rel=0&autoplay=1",
    );
  });

  test("no construye la dirección de un id no válido", () => {
    expect(() => urlDeInsercion("../../evil")).toThrow("no válido");
  });
});
