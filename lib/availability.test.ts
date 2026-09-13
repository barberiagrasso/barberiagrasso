import { describe, expect, it } from "vitest";
import { generarSlotsParaDia } from "./availability";

// generarSlotsParaDia es el corazón del motor de disponibilidad: decide
// qué huecos puede reservar un cliente (desde la app, el panel o
// WhatsApp) cruzando el horario del barbero con sus bloqueos y sus citas
// ya existentes. Un fallo aquí es de los más graves posibles: puede
// ofrecer un hueco que en realidad está ocupado (doble reserva) o
// esconder huecos que sí están libres (ventas perdidas). Se prueba en
// aislado, con datos ya "cargados" a mano, sin tocar Supabase — igual
// que el resto de pruebas de este proyecto.
//
// 15 de enero de 2026 (horario de invierno en España, UTC+1) para que la
// conversión a UTC sea siempre "hora local menos 1", sin sorpresas de
// cambio de hora.
const FECHA = "2026-01-15";
const CANDIDATO_A = { id: "prof-a", nombre: "Ana" };
const CANDIDATO_B = { id: "prof-b", nombre: "Bruno" };
const MUY_ANTES = new Date("2020-01-01T00:00:00.000Z"); // para que la antelación mínima nunca excluya nada

function turno(profesional_id: string, horaInicio: string, horaFin: string) {
  return { profesional_id, hora_inicio: horaInicio, hora_fin: horaFin };
}

describe("generarSlotsParaDia", () => {
  it("genera un hueco cada 15 minutos dentro del turno, incluyendo el que termina justo al cierre", () => {
    const slots = generarSlotsParaDia({
      fecha: FECHA,
      candidatos: [CANDIDATO_A],
      horariosDelDia: [turno(CANDIDATO_A.id, "09:00:00", "10:00:00")],
      bloqueos: [],
      citas: [],
      duracionMinutos: 30,
      ahora: MUY_ANTES,
    });

    expect(slots.map((s) => s.hora_inicio)).toEqual([
      "2026-01-15T08:00:00.000Z", // 09:00 local
      "2026-01-15T08:15:00.000Z", // 09:15 local
      "2026-01-15T08:30:00.000Z", // 09:30 local, termina 10:00 justo al cierre
    ]);
  });

  it("no genera ningún hueco si la duración del servicio no cabe en el turno", () => {
    const slots = generarSlotsParaDia({
      fecha: FECHA,
      candidatos: [CANDIDATO_A],
      horariosDelDia: [turno(CANDIDATO_A.id, "09:00:00", "09:10:00")],
      bloqueos: [],
      citas: [],
      duracionMinutos: 30,
      ahora: MUY_ANTES,
    });
    expect(slots).toEqual([]);
  });

  it("excluye solo el hueco que se solapa con un bloqueo del profesional", () => {
    const slots = generarSlotsParaDia({
      fecha: FECHA,
      candidatos: [CANDIDATO_A],
      horariosDelDia: [turno(CANDIDATO_A.id, "09:00:00", "10:00:00")],
      bloqueos: [{ profesional_id: CANDIDATO_A.id, fecha_inicio: "2026-01-15T08:15:00.000Z", fecha_fin: "2026-01-15T08:30:00.000Z" }],
      citas: [],
      duracionMinutos: 15,
      ahora: MUY_ANTES,
    });
    // Turno de 1h con servicios de 15min: 09:00, 09:15, 09:30, 09:45.
    // El bloqueo de 09:15 a 09:30 (local) solo tapa el hueco de 09:15.
    expect(slots.map((s) => s.hora_inicio)).toEqual([
      "2026-01-15T08:00:00.000Z",
      "2026-01-15T08:30:00.000Z",
      "2026-01-15T08:45:00.000Z",
    ]);
  });

  it("un bloqueo de sede completa (profesional_id null) afecta a todos los candidatos", () => {
    const slots = generarSlotsParaDia({
      fecha: FECHA,
      candidatos: [CANDIDATO_A, CANDIDATO_B],
      horariosDelDia: [turno(CANDIDATO_A.id, "09:00:00", "10:00:00"), turno(CANDIDATO_B.id, "09:00:00", "10:00:00")],
      bloqueos: [{ profesional_id: null, fecha_inicio: "2026-01-15T08:15:00.000Z", fecha_fin: "2026-01-15T08:30:00.000Z" }],
      citas: [],
      duracionMinutos: 15,
      ahora: MUY_ANTES,
    });
    const horasDeA = slots.filter((s) => s.profesional_id === CANDIDATO_A.id).map((s) => s.hora_inicio);
    const horasDeB = slots.filter((s) => s.profesional_id === CANDIDATO_B.id).map((s) => s.hora_inicio);
    expect(horasDeA).not.toContain("2026-01-15T08:15:00.000Z");
    expect(horasDeB).not.toContain("2026-01-15T08:15:00.000Z");
  });

  it("una cita ya existente solo bloquea al profesional que la tiene, no a los demás", () => {
    const slots = generarSlotsParaDia({
      fecha: FECHA,
      candidatos: [CANDIDATO_A, CANDIDATO_B],
      horariosDelDia: [turno(CANDIDATO_A.id, "09:00:00", "10:00:00"), turno(CANDIDATO_B.id, "09:00:00", "10:00:00")],
      bloqueos: [],
      citas: [{ profesional_id: CANDIDATO_A.id, inicio: "2026-01-15T08:00:00.000Z", fin: "2026-01-15T08:15:00.000Z" }],
      duracionMinutos: 15,
      ahora: MUY_ANTES,
    });
    const horasDeA = slots.filter((s) => s.profesional_id === CANDIDATO_A.id).map((s) => s.hora_inicio);
    const horasDeB = slots.filter((s) => s.profesional_id === CANDIDATO_B.id).map((s) => s.hora_inicio);

    expect(horasDeA).not.toContain("2026-01-15T08:00:00.000Z"); // ocupado por su propia cita
    expect(horasDeA).toContain("2026-01-15T08:15:00.000Z"); // libre justo después
    expect(horasDeB).toContain("2026-01-15T08:00:00.000Z"); // Bruno no tiene esa cita, sigue libre
  });

  it("respeta la antelación mínima: no ofrece huecos que empiecen dentro de los próximos 30 minutos", () => {
    const slots = generarSlotsParaDia({
      fecha: FECHA,
      candidatos: [CANDIDATO_A],
      horariosDelDia: [turno(CANDIDATO_A.id, "09:00:00", "10:00:00")],
      bloqueos: [],
      citas: [],
      duracionMinutos: 15,
      ahora: new Date("2026-01-15T08:10:00.000Z"), // 09:10 local
    });
    // Límite = 09:10 + 30min = 09:40 local. De 09:00/09:15/09:30/09:45,
    // solo 09:45 empieza a partir de las 09:40.
    expect(slots.map((s) => s.hora_inicio)).toEqual(["2026-01-15T08:45:00.000Z"]);
  });

  it("un servicio que ya ha empezado antes de ahora nunca se ofrece, aunque el turno siga abierto", () => {
    const slots = generarSlotsParaDia({
      fecha: FECHA,
      candidatos: [CANDIDATO_A],
      horariosDelDia: [turno(CANDIDATO_A.id, "09:00:00", "10:00:00")],
      bloqueos: [],
      citas: [],
      duracionMinutos: 15,
      ahora: new Date("2026-01-15T09:30:00.000Z"), // 10:30 local, después de cerrar
    });
    expect(slots).toEqual([]);
  });

  it("junta y ordena por hora los huecos de varios profesionales candidatos", () => {
    const slots = generarSlotsParaDia({
      fecha: FECHA,
      candidatos: [CANDIDATO_A, CANDIDATO_B],
      horariosDelDia: [turno(CANDIDATO_A.id, "09:00:00", "09:30:00"), turno(CANDIDATO_B.id, "09:00:00", "09:30:00")],
      bloqueos: [],
      citas: [],
      duracionMinutos: 30,
      ahora: MUY_ANTES,
    });
    expect(slots).toHaveLength(2);
    expect(slots.every((s) => s.hora_inicio === "2026-01-15T08:00:00.000Z")).toBe(true);
    expect(slots.map((s) => s.profesional_nombre).sort()).toEqual(["Ana", "Bruno"]);
  });
});
