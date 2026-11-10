import { describe, expect, it } from "vitest";
import { estadoStock, textoPedido, unidadesAPedir } from "./stock";

describe("stock", () => {
  it("pide hasta la cantidad ideal cuando llega al mínimo", () => {
    expect(unidadesAPedir(3, 3, 10)).toBe(7);
    expect(unidadesAPedir(0, 3, 10)).toBe(10);
  });
  it("no pide nada si está por encima del mínimo", () => {
    expect(unidadesAPedir(4, 3, 10)).toBe(0);
  });
  it("nunca da un pedido negativo", () => {
    expect(unidadesAPedir(2, 3, 1)).toBe(0);
  });
  it("estados", () => {
    expect(estadoStock(0, 3)).toBe("agotado");
    expect(estadoStock(2, 3)).toBe("pedir");
    expect(estadoStock(8, 3)).toBe("ok");
  });
  it("texto del pedido solo con lo que falta", () => {
    expect(textoPedido("Los Molinos", [{ nombre: "Cera", unidades: 4 }, { nombre: "Champú", unidades: 0 }])).toBe(
      "Pedido Barbería Grasso — Los Molinos\n• Cera: 4",
    );
  });
});
