import { describe, it, expect } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("une varias clases con un espacio", () => {
    expect(cn("a", "b")).toBe("a b");
  });
  it("ignora false, null y undefined", () => {
    expect(cn("a", false, "b", null, undefined, "c")).toBe("a b c");
  });
  it("devuelve cadena vacía sin argumentos", () => {
    expect(cn()).toBe("");
  });
});
