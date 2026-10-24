import { describe, expect, it } from "vitest";
import {
  calcularGrassoCoins,
  centimosParaSiguienteCoin,
  costeGrassoCoinsCita,
  formatearGrassoCoins,
  progresoSiguienteCoin,
} from "./grassocoins";

// Esta cuenta decide cuántas GrassoCoins gana cada cliente en cada cita
// cobrada: un fallo aquí, multiplicado por cientos de citas al mes, son
// cortes que Diego regala o que sus clientes no reciben.
describe("calcularGrassoCoins", () => {
  it("da 1 coin por cada 20 € y guarda lo que sobra", () => {
    expect(calcularGrassoCoins(0, 2000)).toEqual({ coins: 1, restoCentimos: 0 });
    expect(calcularGrassoCoins(0, 3000)).toEqual({ coins: 1, restoCentimos: 1000 });
    expect(calcularGrassoCoins(0, 6500)).toEqual({ coins: 3, restoCentimos: 500 });
  });

  it("suma lo guardado de visitas anteriores", () => {
    expect(calcularGrassoCoins(1000, 1000)).toEqual({ coins: 1, restoCentimos: 0 });
    expect(calcularGrassoCoins(1999, 1)).toEqual({ coins: 1, restoCentimos: 0 });
    expect(calcularGrassoCoins(500, 1200)).toEqual({ coins: 0, restoCentimos: 1700 });
  });

  it("no da coins por debajo de 20 € pero no pierde el gasto", () => {
    expect(calcularGrassoCoins(0, 1999)).toEqual({ coins: 0, restoCentimos: 1999 });
  });

  it("ignora importes no válidos", () => {
    expect(calcularGrassoCoins(0, 0)).toEqual({ coins: 0, restoCentimos: 0 });
    expect(calcularGrassoCoins(0, -500)).toEqual({ coins: 0, restoCentimos: 0 });
    expect(calcularGrassoCoins(Number.NaN, Number.NaN)).toEqual({ coins: 0, restoCentimos: 0 });
  });
});

describe("progreso hacia la siguiente coin", () => {
  it("dice cuánto falta", () => {
    expect(centimosParaSiguienteCoin(0)).toBe(2000);
    expect(centimosParaSiguienteCoin(1500)).toBe(500);
  });
  it("va de 0 a 1", () => {
    expect(progresoSiguienteCoin(0)).toBe(0);
    expect(progresoSiguienteCoin(1000)).toBe(0.5);
  });
});

describe("costeGrassoCoinsCita", () => {
  it("suma el servicio y los extras", () => {
    expect(costeGrassoCoinsCita({ coste_grassocoins: 5 }, [{ coste_grassocoins: 1 }, { coste_grassocoins: 2 }])).toBe(8);
  });
  it("no se puede canjear si algo no tiene precio en coins", () => {
    expect(costeGrassoCoinsCita({ coste_grassocoins: null })).toBeNull();
    expect(costeGrassoCoinsCita({ coste_grassocoins: 5 }, [{ coste_grassocoins: null }])).toBeNull();
    expect(costeGrassoCoinsCita(null)).toBeNull();
  });
});

describe("formatearGrassoCoins", () => {
  it("usa singular y plural", () => {
    expect(formatearGrassoCoins(1)).toBe("1 GrassoCoin");
    expect(formatearGrassoCoins(0)).toBe("0 GrassoCoins");
    expect(formatearGrassoCoins(4)).toBe("4 GrassoCoins");
  });
});
