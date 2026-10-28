import { describe, expect, it } from "vitest";
import { analizarRendimiento, horarioActual, restar, simularEscenario, type CitaRendimiento, type TurnoSemanal } from "./rendimiento";

const SEDE = "s1";
// Semana del lunes 5 al domingo 11 de octubre de 2026.
const DESDE = "2026-10-05";
const HASTA = "2026-10-11";

function turno(dia: number, inicioH: number, finH: number, descanso?: [number, number]): TurnoSemanal {
  return {
    profesionalId: "b1",
    sedeId: SEDE,
    diaSemana: dia,
    inicioMin: inicioH * 60,
    finMin: finH * 60,
    descansoInicioMin: descanso ? descanso[0] * 60 : null,
    descansoFinMin: descanso ? descanso[1] * 60 : null,
  };
}

function cita(fecha: string, dia: number, inicioH: number, durMin: number, euros: number, cliente = "c1"): CitaRendimiento {
  return { profesionalId: "b1", sedeId: SEDE, clienteId: cliente, fecha, diaSemana: dia, inicioMin: inicioH * 60, finMin: inicioH * 60 + durMin, ingresoCentimos: euros * 100 };
}

const base = {
  desde: DESDE,
  hasta: HASTA,
  barberos: [{ id: "b1", nombre: "Lucas" }],
  sedes: [{ id: SEDE, nombre: "Los Molinos" }],
  excepciones: [],
  ausencias: [],
};

describe("restar intervalos", () => {
  it("quita el descanso del medio del turno", () => {
    expect(restar([[540, 1260]], [[840, 900]])).toEqual([[540, 840], [900, 1260]]);
  });
});

describe("analizarRendimiento", () => {
  it("calcula horas disponibles sin descanso, ocupación y productividad", () => {
    // Lunes 10-20 con descanso 14-15 → 9 h disponibles.
    const r = analizarRendimiento({
      ...base,
      turnos: [turno(1, 10, 20, [14, 15])],
      citas: [cita("2026-10-05", 1, 10, 60, 20), cita("2026-10-05", 1, 11, 30, 12, "c2"), cita("2026-10-05", 1, 16, 90, 30)],
    });
    const b = r.barberos[0];
    expect(b.disponibleMin).toBe(540);
    expect(b.ocupadoMin).toBe(180);
    expect(b.ocupacionPct).toBe(33.3);
    expect(b.facturacionCentimos).toBe(6200);
    expect(b.productividadCentimosHora).toBe(Math.round(6200 / 9));
    expect(b.ticketMedioCentimos).toBe(Math.round(6200 / 3));
    expect(b.clientes).toBe(2);
    // Hueco de 0 min entre 11:00-11:30 y nada más cerca: sin huecos sueltos.
    expect(b.huecosMin).toBe(0);
  });

  it("descuenta ausencias y vacaciones de las horas disponibles", () => {
    const r = analizarRendimiento({
      ...base,
      turnos: [turno(2, 10, 14)],
      ausencias: [{ profesionalId: "b1", sedeId: null, fecha: "2026-10-06", inicioMin: 0, finMin: 1440 }],
      citas: [],
    });
    expect(r.barberos[0].disponibleMin).toBe(0);
  });

  it("detecta huecos sueltos de menos de 30 minutos", () => {
    const r = analizarRendimiento({
      ...base,
      turnos: [turno(1, 10, 14)],
      citas: [cita("2026-10-05", 1, 10, 40, 15), cita("2026-10-05", 1, 11, 30, 15)],
    });
    expect(r.barberos[0].huecosMin).toBe(20);
  });

  it("avisa de baja ocupación en una franja", () => {
    const r = analizarRendimiento({ ...base, turnos: [turno(2, 15, 21)], citas: [cita("2026-10-06", 2, 15, 30, 14)] });
    expect(r.alertas.some((a) => a.tipo === "ocupacion_baja" && a.texto.includes("martes a última hora de la tarde"))).toBe(true);
  });
});

describe("simularEscenario", () => {
  const r = analizarRendimiento({
    ...base,
    turnos: [turno(1, 10, 14), turno(2, 10, 14)],
    citas: [
      cita("2026-10-05", 1, 10, 60, 20),
      cita("2026-10-05", 1, 11, 60, 20),
      cita("2026-10-05", 1, 12, 60, 20),
      cita("2026-10-06", 2, 10, 60, 20),
    ],
  });
  const b = r.barberos[0];

  it("el horario actual reproduce los datos reales", () => {
    const res = simularEscenario(b, r.sedes[0], horarioActual(b), 1, 0.6);
    expect(res.facturacionMensualCentimos).toBe(Math.round(8000 * 4.33));
    expect(res.ocupacionPct).toBe(50);
  });

  it("quitar el martes recoloca parte de sus clientes en los huecos del lunes", () => {
    const propuesta = horarioActual(b).map((fila, d) => fila.map((v) => (d === 2 ? false : v)));
    const res = simularEscenario(b, r.sedes[0], propuesta, 1, 0.6);
    expect(res.horasMensuales).toBe(Math.round(4 * 4.33));
    // 60 € del lunes + 60 % de los 20 € del martes.
    expect(res.facturacionMensualCentimos).toBe(Math.round((6000 + 1200) * 4.33));
    expect(res.ocupacionPct).toBe(90);
  });
});
