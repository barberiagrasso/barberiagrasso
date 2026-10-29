import { describe, expect, it } from "vitest";
import {
  calcularGrassoCoins,
  centimosParaSiguienteCoin,
  costeGrassoCoinsCita,
  fechaCaducidadDesde,
  formatearGrassoCoins,
  MESES_CADUCIDAD_GRASSOCOINS,
  progresoSiguienteCoin,
} from "./grassocoins";

// Esta cuenta decide cuántas GrassoCoins gana cada cliente en cada cobro:
// un fallo aquí, multiplicado por cientos de citas al mes, son servicios
// que Diego regala de más o que sus clientes no reciben.
describe("calcularGrassoCoins", () => {
  it("da 1 coin por cada euro pagado", () => {
    expect(calcularGrassoCoins(0, 1200)).toEqual({ coins: 12, restoCentimos: 0 }); // barba
    expect(calcularGrassoCoins(0, 1400)).toEqual({ coins: 14, restoCentimos: 0 }); // corte en efectivo
    expect(calcularGrassoCoins(0, 4100)).toEqual({ coins: 41, restoCentimos: 0 }); // bono de 4 cortes
  });

  it("guarda los céntimos para la próxima vez", () => {
    expect(calcularGrassoCoins(0, 1280)).toEqual({ coins: 12, restoCentimos: 80 }); // producto de 12,80 €
    expect(calcularGrassoCoins(80, 1420)).toEqual({ coins: 15, restoCentimos: 0 });
    expect(calcularGrassoCoins(99, 1)).toEqual({ coins: 1, restoCentimos: 0 });
  });

  it("no pierde un gasto de menos de 1 €", () => {
    expect(calcularGrassoCoins(0, 50)).toEqual({ coins: 0, restoCentimos: 50 });
  });

  it("ignora importes no válidos", () => {
    expect(calcularGrassoCoins(0, 0)).toEqual({ coins: 0, restoCentimos: 0 });
    expect(calcularGrassoCoins(0, -500)).toEqual({ coins: 0, restoCentimos: 0 });
    expect(calcularGrassoCoins(Number.NaN, Number.NaN)).toEqual({ coins: 0, restoCentimos: 0 });
  });
});

describe("progreso hacia la siguiente coin", () => {
  it("dice cuánto falta", () => {
    expect(centimosParaSiguienteCoin(0)).toBe(100);
    expect(centimosParaSiguienteCoin(80)).toBe(20);
  });
  it("va de 0 a 1", () => {
    expect(progresoSiguienteCoin(0)).toBe(0);
    expect(progresoSiguienteCoin(50)).toBe(0.5);
  });
});

describe("costeGrassoCoinsCita", () => {
  it("suma el servicio y los extras", () => {
    expect(costeGrassoCoinsCita({ coste_grassocoins: 160 }, [{ coste_grassocoins: 35 }])).toBe(195);
  });
  it("no se puede canjear si algo no tiene precio en coins", () => {
    expect(costeGrassoCoinsCita({ coste_grassocoins: null })).toBeNull();
    expect(costeGrassoCoinsCita({ coste_grassocoins: 160 }, [{ coste_grassocoins: null }])).toBeNull();
    expect(costeGrassoCoinsCita(null)).toBeNull();
  });
});

describe("formatearGrassoCoins", () => {
  it("usa singular y plural", () => {
    expect(formatearGrassoCoins(1)).toBe("1 GrassoCoin");
    expect(formatearGrassoCoins(0)).toBe("0 GrassoCoins");
    expect(formatearGrassoCoins(160)).toBe("160 GrassoCoins");
  });
});

describe("caducidad", () => {
  it("caducan 6 meses después de la última visita", () => {
    expect(MESES_CADUCIDAD_GRASSOCOINS).toBe(6);
    const caduca = fechaCaducidadDesde(new Date(2026, 9, 27, 12));
    expect([caduca.getFullYear(), caduca.getMonth(), caduca.getDate()]).toEqual([2027, 3, 27]);
  });
});
