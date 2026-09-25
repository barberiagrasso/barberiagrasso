import { describe, expect, it } from "vitest";
import { construirRecibo, etiquetaMetodoPago } from "./recibo";

function citaBase(overrides: Partial<Parameters<typeof construirRecibo>[0]["cita"]> = {}) {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    inicio: "2026-09-25T13:00:00.000Z",
    estado: "completada",
    pagado_at: "2026-09-25T13:40:00.000Z",
    metodo_pago: "tarjeta",
    precio_final_centimos: null,
    saldo_canjeado_centimos: 0,
    descuento_porcentaje: null,
    descuento_motivo: null,
    recibo_anulado_at: null,
    recibo_anulado_por: null,
    recibo_anulado_motivo: null,
    cliente: { id: "cli-1", nombre: "Carlos Garrido", telefono: "+34677059777" },
    sede: { nombre: "Los Molinos", direccion: "Avenida de Rocinante, 6, 28903, Getafe" },
    profesional: { nombre: "Arthur" },
    servicio: { nombre: "Corte y barba", precio_centimos: 2300 },
    ...overrides,
  };
}

describe("construirRecibo", () => {
  it("suma servicio + complementos + productos cuando no hay precio corregido a mano", () => {
    const recibo = construirRecibo({
      cita: citaBase(),
      extras: [{ precio_centimos: 500, servicio: { nombre: "Cejas" } }],
      productos: [{ cantidad: 2, precio_centimos: 800, producto: { nombre: "Cera" } }],
      pagos: [],
    });
    // 2300 (servicio) + 500 (cejas) + 2*800 (cera) = 4400
    expect(recibo.subtotalCentimos).toBe(4400);
    expect(recibo.totalCentimos).toBe(4400);
    expect(recibo.descuentoCentimos).toBe(0);
    expect(recibo.lineas).toEqual([
      { nombre: "Corte y barba", cantidad: 1, precioUnitarioCentimos: 2300 },
      { nombre: "Cejas", cantidad: 1, precioUnitarioCentimos: 500 },
      { nombre: "Cera", cantidad: 2, precioUnitarioCentimos: 800 },
    ]);
  });

  it("usa el precio final corregido a mano para el total, pero el subtotal sigue siendo el automático de catálogo", () => {
    const recibo = construirRecibo({
      cita: citaBase({ precio_final_centimos: 1800 }),
      extras: [],
      productos: [],
      pagos: [],
    });
    expect(recibo.subtotalCentimos).toBe(2300);
    expect(recibo.totalCentimos).toBe(1800);
    expect(recibo.descuentoCentimos).toBe(500);
  });

  it("los productos siempre cuentan enteros, nunca se ven afectados por el precio final corregido del servicio", () => {
    const recibo = construirRecibo({
      cita: citaBase({ precio_final_centimos: 1000 }),
      extras: [],
      productos: [{ cantidad: 1, precio_centimos: 800, producto: { nombre: "Cera" } }],
      pagos: [],
    });
    // Servicio corregido a 1000 + producto entero 800 = 1800
    expect(recibo.totalCentimos).toBe(1800);
  });

  it("recoge el reparto de pago mixto tal cual, cuando lo hay", () => {
    const recibo = construirRecibo({
      cita: citaBase({ metodo_pago: "mixto" }),
      extras: [],
      productos: [],
      pagos: [
        { metodo: "efectivo", importe_centimos: 1000 },
        { metodo: "tarjeta", importe_centimos: 1300 },
      ],
    });
    expect(recibo.pagosMixtos).toEqual([
      { metodo: "efectivo", importeCentimos: 1000 },
      { metodo: "tarjeta", importeCentimos: 1300 },
    ]);
  });

  it("marca anulado con su motivo cuando la cita tiene recibo_anulado_at", () => {
    const recibo = construirRecibo({
      cita: citaBase({
        recibo_anulado_at: "2026-09-26T09:00:00.000Z",
        recibo_anulado_por: "Diego",
        recibo_anulado_motivo: "Cobro duplicado por error",
      }),
      extras: [],
      productos: [],
      pagos: [],
    });
    expect(recibo.anulado).toEqual({
      atISO: "2026-09-26T09:00:00.000Z",
      por: "Diego",
      motivo: "Cobro duplicado por error",
    });
  });

  it("null cuando el recibo está activo (no anulado)", () => {
    const recibo = construirRecibo({ cita: citaBase(), extras: [], productos: [], pagos: [] });
    expect(recibo.anulado).toBeNull();
  });

  it("genera un código corto a partir del id de la cita", () => {
    const recibo = construirRecibo({ cita: citaBase(), extras: [], productos: [], pagos: [] });
    expect(recibo.codigo).toBe("11111111");
  });
});

describe("etiquetaMetodoPago", () => {
  it("traduce los métodos conocidos a una etiqueta legible", () => {
    expect(etiquetaMetodoPago("tarjeta")).toBe("Terminal de tarjeta física");
    expect(etiquetaMetodoPago("efectivo")).toBe("Efectivo");
    expect(etiquetaMetodoPago("mixto")).toBe("Varios métodos");
  });

  it("cae de vuelta al valor tal cual si no es uno de los conocidos, y a un texto genérico si es null", () => {
    expect(etiquetaMetodoPago("otro-raro")).toBe("otro-raro");
    expect(etiquetaMetodoPago(null)).toBe("Sin especificar");
  });
});
