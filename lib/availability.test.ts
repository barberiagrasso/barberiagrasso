import { describe, expect, it } from "vitest";
import {
  generarSlotsParaDia,
  resolverCandidatosConDestinosPuntuales,
  resolverDescansos,
  vacacionesComoBloqueos,
} from "./availability";

// generarSlotsParaDia es el corazón del motor de disponibilidad: decide
// qué huecos puede reservar un cliente (desde la app, el panel o
// WhatsApp) cruzando el horario del barbero con sus bloqueos, su
// descanso para comer, sus vacaciones y sus citas ya existentes. Un
// fallo aquí es de los más graves posibles: puede ofrecer un hueco que
// en realidad está ocupado (doble reserva) o esconder huecos que sí
// están libres (ventas perdidas). Se prueba en aislado, con datos ya
// "cargados" a mano, sin tocar Supabase — igual que el resto de pruebas
// de este proyecto.
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
  it("con la agenda libre, ofrece un hueco cada 30 minutos, incluyendo el que termina justo al cierre", () => {
    const slots = generarSlotsParaDia({
      fecha: FECHA,
      candidatos: [CANDIDATO_A],
      horariosDelDia: [turno(CANDIDATO_A.id, "09:30:00", "11:00:00")],
      bloqueos: [],
      citas: [],
      duracionMinutos: 30,
      ahora: MUY_ANTES,
    });

    expect(slots.map((s) => s.hora_inicio)).toEqual([
      "2026-01-15T08:30:00.000Z", // 09:30 local
      "2026-01-15T09:00:00.000Z", // 10:00 local
      "2026-01-15T09:30:00.000Z", // 10:30 local, termina 11:00 justo al cierre
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

  it("una cita que dura más de 30 minutos hace que el siguiente hueco empiece justo cuando termina, no en el siguiente múltiplo de 30", () => {
    // Ejemplo exacto de Diego (17/09/2026): turno libre 9:30-20:30, una
    // cita de 9:30 a 10:10 (40'). El siguiente hueco debe ofrecerse a las
    // 10:10 en punto, y desde ahí seguir de 30 en 30 (10:10, 10:40...).
    const slots = generarSlotsParaDia({
      fecha: FECHA,
      candidatos: [CANDIDATO_A],
      horariosDelDia: [turno(CANDIDATO_A.id, "09:30:00", "12:00:00")],
      bloqueos: [],
      citas: [{ profesional_id: CANDIDATO_A.id, inicio: "2026-01-15T08:30:00.000Z", fin: "2026-01-15T09:10:00.000Z" }],
      duracionMinutos: 30,
      ahora: MUY_ANTES,
    });

    // El turno cierra a las 12:00 local: desde las 10:10 la cuadrícula de
    // 30' da 10:10, 10:40, 11:10 — la siguiente (11:40) ya no cabe
    // entera antes del cierre (11:40+30=12:10), así que ese resto de 20
    // minutos al final del turno se pierde, tal y como describe Diego.
    expect(slots.map((s) => s.hora_inicio)).toEqual([
      "2026-01-15T09:10:00.000Z", // 10:10 local — fin exacto de la cita anterior
      "2026-01-15T09:40:00.000Z", // 10:40 local
      "2026-01-15T10:10:00.000Z", // 11:10 local
    ]);
  });

  it("un hueco corto entre dos obstáculos solo ofrece lo que quepa, empezando en el fin del primero", () => {
    // Turno 9:00-11:30, una cita 9:00-9:40 (40') y otra 10:15-11:00. El
    // primer hueco libre es 9:40-10:15 (35'): con servicios de 30' solo
    // cabe uno, justo a las 9:40 (el siguiente, a las 10:10, ya no
    // cabría antes de las 10:15). El segundo hueco es 11:00-11:30 (30'
    // justos): cabe exactamente uno, a las 11:00 — el fin exacto de la
    // segunda cita.
    const slots = generarSlotsParaDia({
      fecha: FECHA,
      candidatos: [CANDIDATO_A],
      horariosDelDia: [turno(CANDIDATO_A.id, "09:00:00", "11:30:00")],
      bloqueos: [],
      citas: [
        { profesional_id: CANDIDATO_A.id, inicio: "2026-01-15T08:00:00.000Z", fin: "2026-01-15T08:40:00.000Z" },
        { profesional_id: CANDIDATO_A.id, inicio: "2026-01-15T09:15:00.000Z", fin: "2026-01-15T10:00:00.000Z" },
      ],
      duracionMinutos: 30,
      ahora: MUY_ANTES,
    });
    expect(slots.map((s) => s.hora_inicio)).toEqual([
      "2026-01-15T08:40:00.000Z", // 9:40 local — fin exacto de la 1ª cita
      "2026-01-15T10:00:00.000Z", // 11:00 local — fin exacto de la 2ª cita
    ]);
  });

  it("excluye solo el hueco que se solapa con un bloqueo del profesional", () => {
    const slots = generarSlotsParaDia({
      fecha: FECHA,
      candidatos: [CANDIDATO_A],
      horariosDelDia: [turno(CANDIDATO_A.id, "09:00:00", "10:30:00")],
      bloqueos: [{ profesional_id: CANDIDATO_A.id, fecha_inicio: "2026-01-15T08:30:00.000Z", fecha_fin: "2026-01-15T08:45:00.000Z" }],
      citas: [],
      duracionMinutos: 15,
      ahora: MUY_ANTES,
    });
    // Turno 9:00-10:30, servicios de 15' (el paso de la cuadrícula sigue
    // siendo siempre de 30' aunque el servicio dure menos — solo importa
    // para saber si cabe o no antes del siguiente obstáculo). El bloqueo
    // de 9:30 a 9:45 (local) parte el turno en dos huecos: 9:00-9:30 (un
    // slot a las 9:00; el siguiente de la cuadrícula, 9:30, ya no cabe
    // antes del bloqueo) y 9:45-10:30 (empieza justo al fin del bloqueo,
    // y el siguiente de la cuadrícula, 10:15, sigue cabiendo).
    expect(slots.map((s) => s.hora_inicio)).toEqual([
      "2026-01-15T08:00:00.000Z", // 9:00
      "2026-01-15T08:45:00.000Z", // 9:45 (fin exacto del bloqueo)
      "2026-01-15T09:15:00.000Z", // 10:15
    ]);
  });

  it("un bloqueo de sede completa (profesional_id null) afecta a todos los candidatos", () => {
    const slots = generarSlotsParaDia({
      fecha: FECHA,
      candidatos: [CANDIDATO_A, CANDIDATO_B],
      horariosDelDia: [turno(CANDIDATO_A.id, "09:00:00", "10:00:00"), turno(CANDIDATO_B.id, "09:00:00", "10:00:00")],
      bloqueos: [{ profesional_id: null, fecha_inicio: "2026-01-15T08:00:00.000Z", fecha_fin: "2026-01-15T09:00:00.000Z" }],
      citas: [],
      duracionMinutos: 15,
      ahora: MUY_ANTES,
    });
    expect(slots).toEqual([]);
  });

  it("el descanso para comer bloquea ese hueco igual que una cita, y el siguiente hueco empieza justo al terminar", () => {
    const slots = generarSlotsParaDia({
      fecha: FECHA,
      candidatos: [CANDIDATO_A],
      horariosDelDia: [turno(CANDIDATO_A.id, "09:30:00", "16:00:00")],
      descansosDelDia: [{ profesional_id: CANDIDATO_A.id, hora_inicio: "14:00:00", hora_fin: "14:50:00" }],
      bloqueos: [],
      citas: [],
      duracionMinutos: 30,
      ahora: MUY_ANTES,
    });
    // 14:50 local = 13:50 UTC: el siguiente hueco tras el descanso debe
    // ofrecerse justo ahí, no en el siguiente múltiplo de 30 (15:00).
    expect(slots.map((s) => s.hora_inicio)).toContain("2026-01-15T13:50:00.000Z");
    expect(slots.map((s) => s.hora_inicio)).not.toContain("2026-01-15T13:00:00.000Z"); // 14:00, dentro del descanso
    expect(slots.map((s) => s.hora_inicio)).not.toContain("2026-01-15T13:20:00.000Z"); // 14:20, dentro del descanso
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

  it("un bloqueo por vacaciones (convertido a bloqueo de día completo) deja sin huecos a ese profesional", () => {
    const inicioDiaUTC = new Date("2026-01-15T00:00:00.000Z");
    const finDiaUTC = new Date("2026-01-15T23:00:00.000Z"); // fin de día en hora de Madrid (UTC+1) ~ suficiente para el test
    const bloqueosVacaciones = vacacionesComoBloqueos(
      [{ profesional_id: CANDIDATO_A.id, fecha_inicio: "2026-01-15", fecha_fin: "2026-01-16" }],
      inicioDiaUTC,
      finDiaUTC
    );
    const slots = generarSlotsParaDia({
      fecha: FECHA,
      candidatos: [CANDIDATO_A, CANDIDATO_B],
      horariosDelDia: [turno(CANDIDATO_A.id, "09:00:00", "10:00:00"), turno(CANDIDATO_B.id, "09:00:00", "10:00:00")],
      bloqueos: bloqueosVacaciones,
      citas: [],
      duracionMinutos: 30,
      ahora: MUY_ANTES,
    });
    expect(slots.some((s) => s.profesional_id === CANDIDATO_A.id)).toBe(false);
    expect(slots.some((s) => s.profesional_id === CANDIDATO_B.id)).toBe(true);
  });

  it("respeta la antelación mínima: no ofrece huecos que empiecen dentro de los próximos 30 minutos", () => {
    const slots = generarSlotsParaDia({
      fecha: FECHA,
      candidatos: [CANDIDATO_A],
      horariosDelDia: [turno(CANDIDATO_A.id, "09:00:00", "11:00:00")],
      bloqueos: [],
      citas: [],
      duracionMinutos: 30,
      ahora: new Date("2026-01-15T08:05:00.000Z"), // 09:05 local
    });
    // Límite = 09:05 + 30min = 09:35 local. De la cuadrícula de 30' desde
    // las 9:00 (09:00/09:30/10:00/10:30), solo 10:00 y 10:30 empiezan a
    // partir de las 09:35.
    expect(slots.map((s) => s.hora_inicio)).toEqual(["2026-01-15T09:00:00.000Z", "2026-01-15T09:30:00.000Z"]);
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

describe("resolverDescansos", () => {
  const horariosDelDia = [
    { profesional_id: CANDIDATO_A.id, descanso_inicio: "14:00:00", descanso_fin: "14:30:00" },
    { profesional_id: CANDIDATO_B.id, descanso_inicio: null, descanso_fin: null },
  ];

  it("usa la regla general si no hay excepción ese día", () => {
    const resultado = resolverDescansos(horariosDelDia, []);
    expect(resultado).toEqual([{ profesional_id: CANDIDATO_A.id, hora_inicio: "14:00:00", hora_fin: "14:30:00" }]);
  });

  it("una excepción puntual sustituye a la regla general ese día, sin cambiarla", () => {
    const resultado = resolverDescansos(horariosDelDia, [
      { profesional_id: CANDIDATO_A.id, hora_inicio: "15:00:00", hora_fin: "15:30:00" },
    ]);
    expect(resultado).toEqual([{ profesional_id: CANDIDATO_A.id, hora_inicio: "15:00:00", hora_fin: "15:30:00" }]);
  });

  it("un profesional sin descanso general ni excepción no aparece en el resultado", () => {
    const resultado = resolverDescansos(horariosDelDia, []);
    expect(resultado.some((d) => d.profesional_id === CANDIDATO_B.id)).toBe(false);
  });
});

describe("resolverCandidatosConDestinosPuntuales", () => {
  // Caso real que motivó esta función (19/09/2026): Juan trabaja por
  // defecto en Avenida de las Ciudades ("ciudades") pero algunos días
  // puntuales se le destina a Los Molinos ("molinos"). Ese día, la
  // agenda de Ciudades no debe ofrecerlo, y la de Molinos sí, con el
  // turno que Diego le haya puesto ese día concreto — sin tocar su
  // horario habitual ni su sede permanente.
  const JUAN = { id: "juan", nombre: "Juan" };
  const ARTHUR = { id: "arthur", nombre: "Arthur" };
  const CIUDADES = "sede-ciudades";
  const MOLINOS = "sede-molinos";
  const TODOS_HACEN_EL_SERVICIO = new Set([JUAN.id, ARTHUR.id]);

  it("sin ningún destino puntual ese día, deja la lista de candidatos permanentes tal cual", () => {
    const resultado = resolverCandidatosConDestinosPuntuales({
      candidatosPermanentes: [JUAN],
      destinosDelDia: [],
      sedeId: CIUDADES,
      idsQueHacenServicio: TODOS_HACEN_EL_SERVICIO,
    });
    expect(resultado).toEqual({ candidatos: [JUAN], horariosExtra: [] });
  });

  it("quita de su sede habitual a quien ese día está destinado a otra", () => {
    const resultado = resolverCandidatosConDestinosPuntuales({
      candidatosPermanentes: [JUAN, ARTHUR],
      destinosDelDia: [
        { profesional_id: JUAN.id, nombre: JUAN.nombre, sede_id: MOLINOS, fecha: "2026-09-25", hora_inicio: "09:30:00", hora_fin: "20:30:00" },
      ],
      sedeId: CIUDADES,
      idsQueHacenServicio: TODOS_HACEN_EL_SERVICIO,
    });
    expect(resultado.candidatos).toEqual([ARTHUR]);
    expect(resultado.horariosExtra).toEqual([]);
  });

  it("añade a la sede de destino a quien tiene un destino puntual ahí, con su turno sintético, aunque no sea de esa sede habitualmente", () => {
    const resultado = resolverCandidatosConDestinosPuntuales({
      candidatosPermanentes: [ARTHUR], // Juan no es permanente de Los Molinos
      destinosDelDia: [
        { profesional_id: JUAN.id, nombre: JUAN.nombre, sede_id: MOLINOS, fecha: "2026-09-25", hora_inicio: "09:30:00", hora_fin: "14:00:00" },
      ],
      sedeId: MOLINOS,
      idsQueHacenServicio: TODOS_HACEN_EL_SERVICIO,
    });
    expect(resultado.candidatos).toEqual([ARTHUR, JUAN]);
    expect(resultado.horariosExtra).toEqual([
      { profesional_id: JUAN.id, hora_inicio: "09:30:00", hora_fin: "14:00:00" },
    ]);
  });

  it("no añade al destino puntual si no realiza el servicio pedido", () => {
    const resultado = resolverCandidatosConDestinosPuntuales({
      candidatosPermanentes: [ARTHUR],
      destinosDelDia: [
        { profesional_id: JUAN.id, nombre: JUAN.nombre, sede_id: MOLINOS, fecha: "2026-09-25", hora_inicio: "09:30:00", hora_fin: "14:00:00" },
      ],
      sedeId: MOLINOS,
      idsQueHacenServicio: new Set([ARTHUR.id]), // Juan no está en el set
    });
    expect(resultado.candidatos).toEqual([ARTHUR]);
    expect(resultado.horariosExtra).toEqual([]);
  });

  it("por defecto (sin ningún destino puntual ese día) Juan sigue contando en Ciudades y nunca en Molinos", () => {
    const enCiudades = resolverCandidatosConDestinosPuntuales({
      candidatosPermanentes: [JUAN],
      destinosDelDia: [],
      sedeId: CIUDADES,
      idsQueHacenServicio: TODOS_HACEN_EL_SERVICIO,
    });
    const enMolinos = resolverCandidatosConDestinosPuntuales({
      candidatosPermanentes: [ARTHUR],
      destinosDelDia: [],
      sedeId: MOLINOS,
      idsQueHacenServicio: TODOS_HACEN_EL_SERVICIO,
    });
    expect(enCiudades.candidatos.map((c) => c.id)).toContain(JUAN.id);
    expect(enMolinos.candidatos.map((c) => c.id)).not.toContain(JUAN.id);
  });
});

describe("vacacionesComoBloqueos", () => {
  it("convierte cada solicitud aprobada en un bloqueo que cubre el día entero", () => {
    const inicioDiaUTC = new Date("2026-01-15T00:00:00.000Z");
    const finDiaUTC = new Date("2026-01-15T23:00:00.000Z");
    const resultado = vacacionesComoBloqueos(
      [{ profesional_id: CANDIDATO_A.id, fecha_inicio: "2026-01-10", fecha_fin: "2026-01-20" }],
      inicioDiaUTC,
      finDiaUTC
    );
    expect(resultado).toEqual([
      { profesional_id: CANDIDATO_A.id, fecha_inicio: inicioDiaUTC.toISOString(), fecha_fin: finDiaUTC.toISOString() },
    ]);
  });
});
