import { describe, expect, test } from "bun:test";
import { esEnlaceDeYoutube, idDeYoutube, urlDeInsercion } from "./video-youtube";

describe("idDeYoutube", () => {
  test("reconoce las formas habituales del enlace", () => {
    expect(idDeYoutube("https://youtu.be/0nT6cqlq8h4")).toBe("0nT6cqlq8h4");
    expect(idDeYoutube("https://youtu.be/0nT6cqlq8h4?si=abc")).toBe("0nT6cqlq8h4");
    expect(idDeYoutube("https://www.youtube.com/watch?v=0nT6cqlq8h4&list=PL1")).toBe("0nT6cqlq8h4");
    expect(idDeYoutube("https://youtube.com/shorts/0nT6cqlq8h4")).toBe("0nT6cqlq8h4");
    expect(idDeYoutube("https://www.youtube-nocookie.com/embed/0nT6cqlq8h4")).toBe("0nT6cqlq8h4");
  });

  test("rechaza ids mal formados y dominios que no son de YouTube", () => {
    expect(idDeYoutube("https://youtu.be/corto")).toBeNull();
    expect(idDeYoutube("https://youtu.be/0nT6cqlq8h4/extra")).toBeNull();
    expect(idDeYoutube('https://www.youtube.com/watch?v=TGQNtzK"><x')).toBeNull();
    expect(idDeYoutube("https://www.youtube.com/channel/0nT6cqlq8h4")).toBeNull();
    expect(idDeYoutube("https://youtube.com.ejemplo.com/watch?v=0nT6cqlq8h4")).toBeNull();
    expect(idDeYoutube("javascript:alert(1)")).toBeNull();
    expect(esEnlaceDeYoutube("../assets/video/a.webp")).toBeFalse();
  });
});

describe("urlDeInsercion", () => {
  test("usa youtube-nocookie y solo reproduce solo si se pide", () => {
    expect(urlDeInsercion("0nT6cqlq8h4")).toBe("https://www.youtube-nocookie.com/embed/0nT6cqlq8h4?rel=0");
    expect(urlDeInsercion("0nT6cqlq8h4", { autoplay: true })).toBe(
      "https://www.youtube-nocookie.com/embed/0nT6cqlq8h4?rel=0&autoplay=1",
    );
  });

  test("no construye la dirección de un id no válido", () => {
    expect(() => urlDeInsercion("../../evil")).toThrow("no válido");
  });
});
