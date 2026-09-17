import { describe, expect, it } from "vitest";
import {
  columnasVisibles,
  rangoHorario,
  resolverDescansosDia,
  ID_SIN_ASIGNAR,
  type Profesional,
  type Horario,
  type CitaParaColumna,
  type DescansoExcepcion,
} from "./calendarioDia";

const LUCAS: Profesional = { id: "lucas", nombre: "Lucas" };
const DAVID: Profesional = { id: "david", nombre: "David" };
const CRISTIAN: Profesional = { id: "cristian", nombre: "Cristian" };

describe("columnasVisibles", () => {
  it("muestra solo a los que tienen turno ese día", () => {
    const horarios: Horario[] = [{ profesional_id: "lucas", hora_inicio: "09:00", hora_fin: "14:00" }];
    const resultado = columnasVisibles([LUCAS, DAVID, CRISTIAN], horarios, []);
    expect(resultado.map((p) => p.id)).toEqual(["lucas"]);
  });

  it("añade también a quien tiene una cita ese día aunque no le tocara turno", () => {
    const horarios: Horario[] = [{ profesional_id: "lucas", hora_inicio: "09:00", hora_fin: "14:00" }];
    const citas: CitaParaColumna[] = [{ profesional: DAVID }];
    const resultado = columnasVisibles([LUCAS, DAVID, CRISTIAN], horarios, citas);
    expect(resultado.map((p) => p.id).sort()).toEqual(["david", "lucas"]);
  });

  it("no duplica a alguien que tiene turno Y cita", () => {
    const horarios: Horario[] = [{ profesional_id: "lucas", hora_inicio: "09:00", hora_fin: "14:00" }];
    const citas: CitaParaColumna[] = [{ profesional: LUCAS }];
    const resultado = columnasVisibles([LUCAS, DAVID], horarios, citas);
    expect(resultado.filter((p) => p.id === "lucas")).toHaveLength(1);
  });

  it("conserva la columna de un profesional con cita que ya no está en la lista de la sede", () => {
    const bajaTemporal: Profesional = { id: "ex-barbero", nombre: "Ex barbero" };
    const citas: CitaParaColumna[] = [{ profesional: bajaTemporal }];
    const resultado = columnasVisibles([LUCAS], [], citas);
    expect(resultado.map((p) => p.id)).toContain("ex-barbero");
  });

  it('añade una columna "Sin asignar" si hay alguna cita sin profesional', () => {
    const citas: CitaParaColumna[] = [{ profesional: null }];
    const resultado = columnasVisibles([LUCAS], [], citas);
    expect(resultado.map((p) => p.id)).toContain(ID_SIN_ASIGNAR);
  });

  it('no añade "Sin asignar" si todas las citas tienen profesional', () => {
    const citas: CitaParaColumna[] = [{ profesional: LUCAS }];
    const resultado = columnasVisibles([LUCAS], [], citas);
    expect(resultado.map((p) => p.id)).not.toContain(ID_SIN_ASIGNAR);
  });

  it("sin turnos ni citas, no hay columnas", () => {
    expect(columnasVisibles([LUCAS, DAVID], [], [])).toEqual([]);
  });
});

describe("rangoHorario", () => {
  it("usa el turno más amplio entre las columnas visibles, redondeado al cuarto de hora", () => {
    const horarios: Horario[] = [
      { profesional_id: "lucas", hora_inicio: "09:10", hora_fin: "17:00" },
      { profesional_id: "david", hora_inicio: "10:00", hora_fin: "20:50" },
    ];
    const resultado = rangoHorario(["lucas", "david"], horarios, []);
    expect(resultado).toEqual({ minInicio: 9 * 60, maxFin: 21 * 60 });
  });

  it("ignora el horario de un profesional que no es una columna visible", () => {
    const horarios: Horario[] = [
      { profesional_id: "lucas", hora_inicio: "09:00", hora_fin: "14:00" },
      { profesional_id: "cristian", hora_inicio: "06:00", hora_fin: "23:00" },
    ];
    const resultado = rangoHorario(["lucas"], horarios, []);
    expect(resultado).toEqual({ minInicio: 9 * 60, maxFin: 14 * 60 });
  });

  it("un turno muy corto se amplía a un mínimo de 4 horas de rango", () => {
    const horarios: Horario[] = [{ profesional_id: "lucas", hora_inicio: "09:00", hora_fin: "10:00" }];
    const resultado = rangoHorario(["lucas"], horarios, []);
    expect(resultado.maxFin - resultado.minInicio).toBeGreaterThanOrEqual(240);
  });

  it("sin horarios, usa el rango de las citas ya puestas", () => {
    const citas = [{ desdeMin: 9 * 60 + 40, hastaMin: 11 * 60 + 10 }];
    const resultado = rangoHorario([], [], citas);
    expect(resultado).toEqual({ minInicio: 9 * 60 + 30, maxFin: 11 * 60 + 30 });
  });

  it("sin horarios ni citas, usa el rango por defecto", () => {
    expect(rangoHorario([], [], [])).toEqual({ minInicio: 9 * 60, maxFin: 20 * 60 });
  });
});

describe("resolverDescansosDia", () => {
  it("usa la regla general del horario cuando no hay excepción ese día", () => {
    const horarios: Horario[] = [
      { profesional_id: "lucas", hora_inicio: "09:30", hora_fin: "20:30", descanso_inicio: "14:00", descanso_fin: "15:00" },
    ];
    const resultado = resolverDescansosDia(horarios, []);
    expect(resultado).toEqual([{ profesional_id: "lucas", hora_inicio: "14:00", hora_fin: "15:00", esExcepcion: false }]);
  });

  it("la excepción puntual del día manda sobre la regla general", () => {
    const horarios: Horario[] = [
      { profesional_id: "lucas", hora_inicio: "09:30", hora_fin: "20:30", descanso_inicio: "14:00", descanso_fin: "15:00" },
    ];
    const excepciones: DescansoExcepcion[] = [{ profesional_id: "lucas", hora_inicio: "15:30", hora_fin: "16:30" }];
    const resultado = resolverDescansosDia(horarios, excepciones);
    expect(resultado).toEqual([{ profesional_id: "lucas", hora_inicio: "15:30", hora_fin: "16:30", esExcepcion: true }]);
  });

  it("sin regla general ni excepción, no hay descanso ese día", () => {
    const horarios: Horario[] = [{ profesional_id: "lucas", hora_inicio: "09:30", hora_fin: "20:30" }];
    expect(resolverDescansosDia(horarios, [])).toEqual([]);
  });

  it("una excepción puede darle descanso a alguien sin regla general (día suelto)", () => {
    const horarios: Horario[] = [{ profesional_id: "lucas", hora_inicio: "09:30", hora_fin: "20:30" }];
    const excepciones: DescansoExcepcion[] = [{ profesional_id: "lucas", hora_inicio: "13:00", hora_fin: "13:30" }];
    const resultado = resolverDescansosDia(horarios, excepciones);
    expect(resultado).toEqual([{ profesional_id: "lucas", hora_inicio: "13:00", hora_fin: "13:30", esExcepcion: true }]);
  });

  it("resuelve el descanso de cada profesional por separado", () => {
    const horarios: Horario[] = [
      { profesional_id: "lucas", hora_inicio: "09:30", hora_fin: "20:30", descanso_inicio: "14:00", descanso_fin: "15:00" },
      { profesional_id: "david", hora_inicio: "09:30", hora_fin: "20:30", descanso_inicio: "13:00", descanso_fin: "14:00" },
    ];
    const excepciones: DescansoExcepcion[] = [{ profesional_id: "david", hora_inicio: "16:00", hora_fin: "17:00" }];
    const resultado = resolverDescansosDia(horarios, excepciones);
    expect(resultado).toEqual([
      { profesional_id: "lucas", hora_inicio: "14:00", hora_fin: "15:00", esExcepcion: false },
      { profesional_id: "david", hora_inicio: "16:00", hora_fin: "17:00", esExcepcion: true },
    ]);
  });

  it("no duplica si por error hay dos filas de horario del mismo profesional ese día", () => {
    const horarios: Horario[] = [
      { profesional_id: "lucas", hora_inicio: "09:30", hora_fin: "20:30", descanso_inicio: "14:00", descanso_fin: "15:00" },
      { profesional_id: "lucas", hora_inicio: "09:30", hora_fin: "20:30", descanso_inicio: "14:00", descanso_fin: "15:00" },
    ];
    expect(resolverDescansosDia(horarios, [])).toHaveLength(1);
  });
});
