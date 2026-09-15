import { describe, expect, it } from "vitest";
import { calcularComision, siguienteTramo, validarTramos, rangoDelMes, mesActualStr, sumarMeses, etiquetaMes, type TramoComision } from "./comisiones";

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
