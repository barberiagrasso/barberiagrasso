import { describe, expect, it } from "vitest";
import {
  calcularComision,
  siguienteTramo,
  validarTramos,
  rangoDelMes,
  mesActualStr,
  sumarMeses,
  etiquetaMes,
  etiquetaTramo,
  calcularRanking,
  type TramoComision,
} from "./comisiones";

// Los mismos 4 tramos que pidió Diego, en céntimos:
// 3.500-3.800€ → 35% · 3.800-4.000€ → 38% · 4.000-4.500€ → 40% · 4.500€+ → 42%
const TRAMOS: TramoComision[] = [
  { desdeCentimos: 350000, hastaCentimos: 380000, porcentaje: 35 },
  { desdeCentimos: 380000, hastaCentimos: 400000, porcentaje: 38 },
  { desdeCentimos: 400000, hastaCentimos: 450000, porcentaje: 40 },
  { desdeCentimos: 450000, hastaCentimos: null, porcentaje: 42 },
];

describe("calcularComision", () => {
  it("aplica el porcentaje del tramo a TODA la facturación, no solo a la parte dentro del tramo", () => {
    // 3.900€ cae en el tramo 3.800-4.000 (38%) → comisión = 3.900 × 38% = 1.482€
    const { comisionCentimos, tramo } = calcularComision(390000, TRAMOS);
    expect(comisionCentimos).toBe(148200);
    expect(tramo?.porcentaje).toBe(38);
  });

  it("el límite inferior de un tramo ya cuenta para ese tramo", () => {
    const { tramo } = calcularComision(380000, TRAMOS);
    expect(tramo?.porcentaje).toBe(38);
  });

  it("el límite superior ya es del siguiente tramo (no del actual)", () => {
    const { tramo } = calcularComision(379999, TRAMOS);
    expect(tramo?.porcentaje).toBe(35);
  });

  it("el tramo más alto no tiene límite superior", () => {
    const { comisionCentimos, tramo } = calcularComision(1000000, TRAMOS);
    expect(tramo?.porcentaje).toBe(42);
    expect(comisionCentimos).toBe(420000);
  });

  it("por debajo del primer tramo, la comisión es 0", () => {
    const { comisionCentimos, tramo } = calcularComision(200000, TRAMOS);
    expect(comisionCentimos).toBe(0);
    expect(tramo).toBeNull();
  });

  it("en un hueco entre dos tramos, la comisión es 0", () => {
    const conHueco: TramoComision[] = [
      { desdeCentimos: 350000, hastaCentimos: 380000, porcentaje: 35 },
      { desdeCentimos: 400000, hastaCentimos: null, porcentaje: 42 },
    ];
    const { comisionCentimos, tramo } = calcularComision(390000, conHueco);
    expect(comisionCentimos).toBe(0);
    expect(tramo).toBeNull();
  });

  it("redondea la comisión al céntimo", () => {
    const tramos: TramoComision[] = [{ desdeCentimos: 0, hastaCentimos: null, porcentaje: 33.33 }];
    const { comisionCentimos } = calcularComision(100, tramos);
    expect(comisionCentimos).toBe(33); // 100 × 33.33% = 33.33 → redondeado a 33
  });
});

describe("siguienteTramo", () => {
  it("devuelve el tramo inmediatamente por encima de la facturación actual", () => {
    expect(siguienteTramo(390000, TRAMOS)?.porcentaje).toBe(40);
  });

  it("devuelve null si ya está en el tramo más alto", () => {
    expect(siguienteTramo(500000, TRAMOS)).toBeNull();
  });

  it("devuelve el primer tramo si la facturación está por debajo de todos", () => {
    expect(siguienteTramo(0, TRAMOS)?.porcentaje).toBe(35);
  });
});

describe("validarTramos", () => {
  it("acepta los tramos de Diego tal cual", () => {
    expect(validarTramos(TRAMOS)).toBeNull();
  });

  it("acepta tramos con huecos entre ellos", () => {
    const conHueco: TramoComision[] = [
      { desdeCentimos: 350000, hastaCentimos: 380000, porcentaje: 35 },
      { desdeCentimos: 400000, hastaCentimos: null, porcentaje: 42 },
    ];
    expect(validarTramos(conHueco)).toBeNull();
  });

  it("rechaza una lista vacía", () => {
    expect(validarTramos([])).not.toBeNull();
  });

  it('rechaza que "hasta" sea menor o igual que "desde"', () => {
    const invalido: TramoComision[] = [{ desdeCentimos: 380000, hastaCentimos: 350000, porcentaje: 35 }];
    expect(validarTramos(invalido)).not.toBeNull();
  });

  it("rechaza un porcentaje fuera de 0-100", () => {
    const invalido: TramoComision[] = [{ desdeCentimos: 0, hastaCentimos: null, porcentaje: 120 }];
    expect(validarTramos(invalido)).not.toBeNull();
  });

  it("rechaza dos tramos que se solapan", () => {
    const solapados: TramoComision[] = [
      { desdeCentimos: 350000, hastaCentimos: 390000, porcentaje: 35 },
      { desdeCentimos: 380000, hastaCentimos: 400000, porcentaje: 38 },
    ];
    expect(validarTramos(solapados)).not.toBeNull();
  });

  it("rechaza más de un tramo sin límite superior", () => {
    const dosAbiertos: TramoComision[] = [
      { desdeCentimos: 350000, hastaCentimos: null, porcentaje: 35 },
      { desdeCentimos: 400000, hastaCentimos: null, porcentaje: 42 },
    ];
    expect(validarTramos(dosAbiertos)).not.toBeNull();
  });

  it("acepta tramos aunque no vengan ordenados en la lista", () => {
    const desordenados = [...TRAMOS].reverse();
    expect(validarTramos(desordenados)).toBeNull();
  });
});

describe("rangoDelMes", () => {
  it("calcula el primer y último día de un mes de 31 días", () => {
    expect(rangoDelMes("2026-01")).toEqual({ desdeStr: "2026-01-01", hastaStr: "2026-01-31" });
  });

  it("calcula el primer y último día de un mes de 30 días", () => {
    expect(rangoDelMes("2026-09")).toEqual({ desdeStr: "2026-09-01", hastaStr: "2026-09-30" });
  });

  it("calcula febrero en año bisiesto", () => {
    expect(rangoDelMes("2028-02")).toEqual({ desdeStr: "2028-02-01", hastaStr: "2028-02-29" });
  });

  it("calcula febrero en año no bisiesto", () => {
    expect(rangoDelMes("2026-02")).toEqual({ desdeStr: "2026-02-01", hastaStr: "2026-02-28" });
  });
});

describe("mesActualStr", () => {
  it('formatea una fecha como "YYYY-MM"', () => {
    expect(mesActualStr(new Date(2026, 8, 15))).toBe("2026-09"); // los meses de Date() van de 0 a 11
  });
});

describe("sumarMeses", () => {
  it("avanza un mes dentro del mismo año", () => {
    expect(sumarMeses("2026-09", 1)).toBe("2026-10");
  });

  it("retrocede un mes dentro del mismo año", () => {
    expect(sumarMeses("2026-09", -1)).toBe("2026-08");
  });

  it("cruza de diciembre a enero del año siguiente", () => {
    expect(sumarMeses("2026-12", 1)).toBe("2027-01");
  });

  it("cruza de enero a diciembre del año anterior", () => {
    expect(sumarMeses("2026-01", -1)).toBe("2025-12");
  });
});

describe("etiquetaMes", () => {
  it("devuelve el mes en español con la primera letra en mayúscula", () => {
    expect(etiquetaMes("2026-09")).toBe("Septiembre 2026");
  });
});

describe("etiquetaTramo", () => {
  it("etiqueta cada tramo según su posición, de menor a mayor facturación", () => {
    expect(etiquetaTramo(TRAMOS[0], TRAMOS)).toBe("F1");
    expect(etiquetaTramo(TRAMOS[1], TRAMOS)).toBe("F2");
    expect(etiquetaTramo(TRAMOS[3], TRAMOS)).toBe("F4");
  });

  it("usa el orden de la lista recibida tal cual (el llamante debe pasarla ya ordenada)", () => {
    const desordenados = [...TRAMOS].reverse(); // el primero de la lista pasa a ser F1
    expect(etiquetaTramo(TRAMOS[3], desordenados)).toBe("F1");
  });

  it('devuelve cadena vacía si el tramo no está en la lista', () => {
    const otro: TramoComision = { desdeCentimos: 999999, hastaCentimos: null, porcentaje: 50 };
    expect(etiquetaTramo(otro, TRAMOS)).toBe("");
  });
});

describe("calcularRanking", () => {
  it("ordena de mayor a menor facturación y numera desde el 1", () => {
    const filas = [
      { nombre: "Ana", facturacionCentimos: 100000 },
      { nombre: "Bea", facturacionCentimos: 300000 },
      { nombre: "Cris", facturacionCentimos: 200000 },
    ];
    const resultado = calcularRanking(filas);
    expect(resultado.map((f) => f.nombre)).toEqual(["Bea", "Cris", "Ana"]);
    expect(resultado.map((f) => f.posicion)).toEqual([1, 2, 3]);
    expect(resultado.every((f) => f.total === 3)).toBe(true);
  });

  it("dos facturaciones iguales comparten posición, y la siguiente salta el hueco", () => {
    const filas = [
      { nombre: "Ana", facturacionCentimos: 300000 },
      { nombre: "Bea", facturacionCentimos: 300000 },
      { nombre: "Cris", facturacionCentimos: 100000 },
    ];
    const resultado = calcularRanking(filas);
    const porNombre = Object.fromEntries(resultado.map((f) => [f.nombre, f.posicion]));
    expect(porNombre.Ana).toBe(1);
    expect(porNombre.Bea).toBe(1);
    expect(porNombre.Cris).toBe(3); // salta el 2, porque dos ya ocupan el 1
  });

  it("una lista de una sola fila queda en la posición 1 de 1", () => {
    const resultado = calcularRanking([{ nombre: "Ana", facturacionCentimos: 50000 }]);
    expect(resultado[0].posicion).toBe(1);
    expect(resultado[0].total).toBe(1);
  });

  it("conserva el resto de campos de cada fila, no solo la facturación", () => {
    const resultado = calcularRanking([{ nombre: "Ana", facturacionCentimos: 50000, citas: 3 }]);
    expect(resultado[0].citas).toBe(3);
  });
});
