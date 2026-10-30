import { describe, expect, it } from "vitest";
import { coincide, distancia, tokenizar } from "../src/lib/busqueda";
import { slugify } from "../src/lib/slug";

describe("distancia", () => {
  it("cuenta inserciones, borrados, sustituciones y transposiciones", () => {
    expect(distancia("salsa", "salsa")).toBe(0);
    expect(distancia("salza", "salsa")).toBe(1);
    expect(distancia("tetro", "teatro")).toBe(1);
    expect(distancia("teartro", "teatro")).toBe(1);
    expect(distancia("teatro", "tetaro")).toBe(1); // letras vecinas intercambiadas
    expect(distancia("abc", "xyz")).toBe(3);
  });
});

describe("tokenizar", () => {
  it("quita tildes, signos y mayúsculas", () => {
    expect(tokenizar("¿Porro o miedo? Medellín")).toEqual(["porro", "o", "miedo", "medellin"]);
  });
});

describe("coincide", () => {
  const texto = "Concierto de salsa en El Poblado con teatro y música en vivo";
  it("ignora tildes y mayúsculas", () => {
    expect(coincide(texto, "MUSICA")).toBe(true);
    expect(coincide(texto, "música")).toBe(true);
  });
  it("acepta prefijos", () => {
    expect(coincide(texto, "conc")).toBe(true);
    expect(coincide(texto, "pobl")).toBe(true);
  });
  it("tolera errores leves de escritura", () => {
    expect(coincide(texto, "conciero")).toBe(true);
    expect(coincide(texto, "tetro")).toBe(true);
    expect(coincide(texto, "salza")).toBe(true);
    expect(coincide(texto, "poblaod")).toBe(true);
  });
  it("palabras muy cortas deben ser exactas (evita falsos positivos)", () => {
    expect(coincide("casa del rio", "cas")).toBe(true);
    expect(coincide("casa del rio", "ces")).toBe(false);
  });
  it("todas las palabras deben coincidir", () => {
    expect(coincide(texto, "salsa poblado")).toBe(true);
    expect(coincide(texto, "salsa cartagena")).toBe(false);
  });
  it("una consulta vacía coincide con todo", () => {
    expect(coincide(texto, "   ")).toBe(true);
  });
  it("no mezcla palabras distintas", () => {
    expect(coincide("parque norte", "arte")).toBe(false);
  });
});

describe("slugify", () => {
  it("genera slugs limpios", () => {
    expect(slugify("El Poblado")).toBe("el-poblado");
    expect(slugify("Belén")).toBe("belen");
    expect(slugify("  Ciudad del Río! ")).toBe("ciudad-del-rio");
  });
});
