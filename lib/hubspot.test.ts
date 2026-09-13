import { describe, expect, it } from "vitest";
import { calcularEstadisticasCliente, calcularSegmento, estadoADealstage, type HistoricoFila } from "./hubspot";

function fila(parcial: Partial<HistoricoFila> & { estado: string; inicio: string }): HistoricoFila {
  return {
    servicio: null,
    profesional: null,
    extras: null,
    ...parcial,
  };
}

describe("calcularSegmento", () => {
  it("un cliente sin visitas completadas es 'nuevo', sin importar el gasto", () => {
    expect(calcularSegmento(0, 0, null)).toBe("nuevo");
  });

  it("más de 90 días sin venir es 'inactivo', aunque tenga muchas visitas", () => {
    const hace100Dias = new Date(Date.now() - 100 * 86400000).toISOString();
    expect(calcularSegmento(10, 500, hace100Dias)).toBe("inactivo");
  });

  it("6 o más visitas completadas es 'vip'", () => {
    const ayer = new Date(Date.now() - 86400000).toISOString();
    expect(calcularSegmento(6, 50, ayer)).toBe("vip");
  });

  it("300€ o más gastados es 'vip' aunque haya ido pocas veces", () => {
    const ayer = new Date(Date.now() - 86400000).toISOString();
    expect(calcularSegmento(2, 300, ayer)).toBe("vip");
  });

  it("con visitas recientes pero por debajo de los umbrales VIP es 'activo'", () => {
    const ayer = new Date(Date.now() - 86400000).toISOString();
    expect(calcularSegmento(2, 40, ayer)).toBe("activo");
  });
});

describe("calcularEstadisticasCliente", () => {
  it("ignora las citas canceladas y no presentadas al calcular gasto y visitas", () => {
    const historico: HistoricoFila[] = [
      fila({ estado: "completada", inicio: "2026-06-01T10:00:00Z", servicio: { nombre: "Corte", precio_centimos: 1500 } }),
      fila({ estado: "cancelada", inicio: "2026-06-05T10:00:00Z", servicio: { nombre: "Corte", precio_centimos: 1500 } }),
      fila({ estado: "no_presentada", inicio: "2026-06-08T10:00:00Z", servicio: { nombre: "Corte", precio_centimos: 1500 } }),
    ];
    const stats = calcularEstadisticasCliente(historico);
    expect(stats.visitasCompletadas).toBe(1);
    expect(stats.gastoTotalEur).toBe(15);
  });

  it("suma el precio de los complementos (extras) al gasto total", () => {
    const historico: HistoricoFila[] = [
      fila({
        estado: "completada",
        inicio: "2026-06-01T10:00:00Z",
        servicio: { nombre: "Corte", precio_centimos: 1500 },
        extras: [{ precio_centimos: 500 }, { precio_centimos: 300 }],
      }),
    ];
    expect(calcularEstadisticasCliente(historico).gastoTotalEur).toBe(23);
  });

  it("la última visita es la más reciente de las citas COMPLETADAS, no la última cita de cualquier tipo", () => {
    const historico: HistoricoFila[] = [
      // Viene ordenado por fecha desc, como lo devuelve la consulta real.
      fila({ estado: "cancelada", inicio: "2026-06-10T10:00:00Z" }),
      fila({ estado: "completada", inicio: "2026-06-01T10:00:00Z" }),
    ];
    expect(calcularEstadisticasCliente(historico).ultimaVisitaISO).toBe("2026-06-01T10:00:00Z");
  });

  it("el servicio y profesional favoritos son los más repetidos entre las citas completadas", () => {
    const historico: HistoricoFila[] = [
      fila({ estado: "completada", inicio: "2026-06-01T10:00:00Z", servicio: { nombre: "Corte", precio_centimos: 1500 }, profesional: { nombre: "Lucas" } }),
      fila({ estado: "completada", inicio: "2026-06-08T10:00:00Z", servicio: { nombre: "Corte", precio_centimos: 1500 }, profesional: { nombre: "Ana" } }),
      fila({ estado: "completada", inicio: "2026-06-15T10:00:00Z", servicio: { nombre: "Barba", precio_centimos: 1000 }, profesional: { nombre: "Lucas" } }),
    ];
    const stats = calcularEstadisticasCliente(historico);
    expect(stats.servicioFavorito).toBe("Corte");
    expect(stats.profesionalFavorito).toBe("Lucas");
  });

  it("un cliente sin ninguna cita completada da un segmento 'nuevo' y campos vacíos, sin lanzar", () => {
    const stats = calcularEstadisticasCliente([]);
    expect(stats.visitasCompletadas).toBe(0);
    expect(stats.gastoTotalEur).toBe(0);
    expect(stats.ultimaVisitaISO).toBeNull();
    expect(stats.segmento).toBe("nuevo");
  });
});

describe("estadoADealstage", () => {
  it("cada estado de cita de la app mapea a una fase DISTINTA del pipeline (cancelada != no_presentada)", () => {
    const fases = new Set([
      estadoADealstage("confirmada"),
      estadoADealstage("completada"),
      estadoADealstage("cancelada"),
      estadoADealstage("no_presentada"),
    ]);
    expect(fases.size).toBe(4);
  });
});
