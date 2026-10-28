// GRASSO PERFORMANCE IA — cálculo de rendimiento y simulador de horarios.
//
// Lógica pura (sin base de datos ni "server-only"): la usa la ruta
// /api/admin/rendimiento para analizar y la página del simulador para
// recalcular escenarios en vivo en el navegador.
//
// Definiciones (pedidas por David, 28/10/2026):
//  - Horas disponibles para atender = turno de horarios − descanso para
//    comer (o su excepción de ese día) − bloqueos (ausencias, cierres) −
//    vacaciones aprobadas.
//  - Horas efectivamente trabajadas = horas disponibles. La app no tiene
//    fichaje: se da por trabajado el turno menos descansos y ausencias.
//  - Horas ocupadas = minutos de citas COMPLETADAS dentro de esas horas.
//  - Tasa de ocupación = ocupadas / disponibles × 100.
//  - Productividad = facturación / horas trabajadas.
// La facturación de cada cita es la de Comisiones (lib/facturacionCita.ts):
// aquí no se recalcula ni se toca ninguna comisión.

export const OBJETIVO_MENSUAL_CENTIMOS = 400_000; // 4.000 €
export const SEMANAS_POR_MES = 4.33;
export const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
export const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
// Orden de lunes a domingo para pintar tablas.
export const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0];

export type Intervalo = [number, number]; // minutos desde las 00:00, [inicio, fin)

export interface TurnoSemanal {
  profesionalId: string;
  sedeId: string;
  diaSemana: number; // 0 = domingo (igual que la tabla horarios)
  inicioMin: number;
  finMin: number;
  descansoInicioMin: number | null;
  descansoFinMin: number | null;
}

export interface ExcepcionDescanso {
  profesionalId: string;
  fecha: string; // YYYY-MM-DD
  inicioMin: number;
  finMin: number;
}

// Ausencia ya partida por día en hora de Madrid. profesionalId null =
// afecta a todo el equipo de esa sede (cierre).
export interface AusenciaDia {
  profesionalId: string | null;
  sedeId: string | null; // null = cualquier sede (vacaciones del barbero)
  fecha: string;
  inicioMin: number;
  finMin: number;
}

export interface CitaRendimiento {
  profesionalId: string;
  sedeId: string;
  clienteId: string;
  fecha: string; // YYYY-MM-DD en Madrid
  diaSemana: number;
  inicioMin: number;
  finMin: number;
  ingresoCentimos: number;
}

export interface Celda {
  disponibleMin: number;
  ocupadoMin: number;
  ingresoCentimos: number;
  semanasConTurno: number; // cuántas fechas de ese día de la semana tuvo turno en esa hora
}

export interface ResumenBarbero {
  profesionalId: string;
  nombre: string;
  sedeIds: string[];
  facturacionCentimos: number;
  disponibleMin: number;
  ocupadoMin: number;
  libreMin: number;
  huecosMin: number; // minutos sueltos (< 30) entre dos citas seguidas: casi imposibles de vender
  citas: number;
  clientes: number;
  ocupacionPct: number | null;
  productividadCentimosHora: number | null;
  ticketMedioCentimos: number | null;
  proyeccionMensualCentimos: number;
  horasMensuales: number;
  // [diaSemana][hora] para este barbero.
  rejilla: Celda[][];
}

export interface CeldaSede {
  disponibleMin: number;
  ocupadoMin: number;
  barberosMedios: number; // media de barberos con turno en esa hora ese día de la semana
}

export interface AnalisisRendimiento {
  desde: string;
  hasta: string;
  semanas: number;
  barberos: ResumenBarbero[];
  sedes: { sedeId: string; nombre: string; rejilla: CeldaSede[][] }[];
  alertas: Alerta[];
}

export interface Alerta {
  tipo: "ocupacion_baja" | "falta_personal" | "sobra_personal" | "productividad_baja" | "huecos" | "objetivo";
  prioridad: 1 | 2 | 3; // 1 = más importante
  profesionalId: string | null;
  sedeId: string | null;
  texto: string;
}

// ---------------------------------------------------------------------
// Utilidades de intervalos
// ---------------------------------------------------------------------

export function restar(base: Intervalo[], quitar: Intervalo[]): Intervalo[] {
  let resultado = base.map((i) => [...i] as Intervalo);
  for (const [qi, qf] of quitar) {
    const nuevo: Intervalo[] = [];
    for (const [i, f] of resultado) {
      if (qf <= i || qi >= f) {
        nuevo.push([i, f]);
        continue;
      }
      if (qi > i) nuevo.push([i, qi]);
      if (qf < f) nuevo.push([qf, f]);
    }
    resultado = nuevo;
  }
  return resultado.filter(([i, f]) => f > i);
}

export function solape(a: Intervalo, b: Intervalo): number {
  return Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]));
}

function rejillaVacia<T>(crear: () => T): T[][] {
  return Array.from({ length: 7 }, () => Array.from({ length: 24 }, crear));
}

const celdaVacia = (): Celda => ({ disponibleMin: 0, ocupadoMin: 0, ingresoCentimos: 0, semanasConTurno: 0 });

export function fechasEntre(desde: string, hasta: string): string[] {
  const fechas: string[] = [];
  const d = new Date(`${desde}T12:00:00Z`);
  const fin = new Date(`${hasta}T12:00:00Z`);
  while (d <= fin) {
    fechas.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return fechas;
}

export function diaSemanaDe(fecha: string): number {
  return new Date(`${fecha}T12:00:00Z`).getUTCDay();
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

// ---------------------------------------------------------------------
// Análisis
// ---------------------------------------------------------------------

export function analizarRendimiento(entrada: {
  desde: string;
  hasta: string;
  barberos: { id: string; nombre: string }[];
  sedes: { id: string; nombre: string }[];
  turnos: TurnoSemanal[];
  excepciones: ExcepcionDescanso[];
  ausencias: AusenciaDia[];
  citas: CitaRendimiento[];
}): AnalisisRendimiento {
  const fechas = fechasEntre(entrada.desde, entrada.hasta);
  const semanas = Math.max(1, fechas.length / 7);

  const excepcionPor = new Map(entrada.excepciones.map((e) => [`${e.profesionalId}|${e.fecha}`, e]));
  const citasPor = new Map<string, CitaRendimiento[]>();
  for (const c of entrada.citas) {
    const k = `${c.profesionalId}|${c.fecha}`;
    if (!citasPor.has(k)) citasPor.set(k, []);
    citasPor.get(k)!.push(c);
  }

  const rejillasSede = new Map<string, { celdas: CeldaSede[][]; presencias: number[][] }>();
  for (const s of entrada.sedes) {
    rejillasSede.set(s.id, {
      celdas: rejillaVacia<CeldaSede>(() => ({ disponibleMin: 0, ocupadoMin: 0, barberosMedios: 0 })),
      presencias: rejillaVacia(() => 0),
    });
  }
  const fechasPorDia = Array(7).fill(0);
  for (const f of fechas) fechasPorDia[diaSemanaDe(f)] += 1;

  const barberos: ResumenBarbero[] = entrada.barberos.map((b) => {
    const rejilla = rejillaVacia(celdaVacia);
    let disponibleMin = 0;
    let ocupadoMin = 0;
    let huecosMin = 0;
    const sedeIds = new Set<string>();

    for (const fecha of fechas) {
      const dia = diaSemanaDe(fecha);
      const turnos = entrada.turnos.filter((t) => t.profesionalId === b.id && t.diaSemana === dia);
      const citasDia = (citasPor.get(`${b.id}|${fecha}`) ?? []).sort((x, y) => x.inicioMin - y.inicioMin);

      for (const t of turnos) {
        sedeIds.add(t.sedeId);
        const quitar: Intervalo[] = [];
        const exc = excepcionPor.get(`${b.id}|${fecha}`);
        if (exc) quitar.push([exc.inicioMin, exc.finMin]);
        else if (t.descansoInicioMin !== null && t.descansoFinMin !== null) quitar.push([t.descansoInicioMin, t.descansoFinMin]);
        for (const a of entrada.ausencias) {
          if (a.fecha !== fecha) continue;
          const esSuya = a.profesionalId === b.id && (a.sedeId === null || a.sedeId === t.sedeId);
          const esCierreSede = a.profesionalId === null && a.sedeId === t.sedeId;
          if (esSuya || esCierreSede) quitar.push([a.inicioMin, a.finMin]);
        }
        const disponibles = restar([[t.inicioMin, t.finMin]], quitar);
        const citasSede = citasDia.filter((c) => c.sedeId === t.sedeId);
        const sede = rejillasSede.get(t.sedeId);

        for (let h = 0; h < 24; h++) {
          const hora: Intervalo = [h * 60, h * 60 + 60];
          const disp = disponibles.reduce((acc, i) => acc + solape(i, hora), 0);
          if (disp <= 0) continue;
          // Minutos de cita dentro de la parte disponible de esta hora.
          let ocup = 0;
          for (const i of disponibles) {
            const tramo: Intervalo = [Math.max(i[0], hora[0]), Math.min(i[1], hora[1])];
            if (tramo[1] <= tramo[0]) continue;
            for (const c of citasSede) ocup += solape(tramo, [c.inicioMin, c.finMin]);
          }
          ocup = Math.min(ocup, disp);
          const celda = rejilla[dia][h];
          celda.disponibleMin += disp;
          celda.ocupadoMin += ocup;
          celda.semanasConTurno += 1;
          disponibleMin += disp;
          ocupadoMin += ocup;
          if (sede) {
            sede.celdas[dia][h].disponibleMin += disp;
            sede.celdas[dia][h].ocupadoMin += ocup;
            sede.presencias[dia][h] += disp / 60;
          }
        }
      }

      // Facturación: se reparte por las horas que dura cada cita.
      for (const c of citasDia) {
        sedeIds.add(c.sedeId);
        const dur = Math.max(1, c.finMin - c.inicioMin);
        for (let h = Math.floor(c.inicioMin / 60); h * 60 < c.finMin && h < 24; h++) {
          const parte = solape([c.inicioMin, c.finMin], [h * 60, h * 60 + 60]);
          rejilla[c.diaSemana][h].ingresoCentimos += Math.round((c.ingresoCentimos * parte) / dur);
        }
      }
      for (let i = 1; i < citasDia.length; i++) {
        const hueco = citasDia[i].inicioMin - citasDia[i - 1].finMin;
        if (hueco > 0 && hueco < 30) huecosMin += hueco;
      }
    }

    const misCitas = entrada.citas.filter((c) => c.profesionalId === b.id);
    const facturacion = misCitas.reduce((acc, c) => acc + c.ingresoCentimos, 0);
    const proyeccion = Math.round((facturacion / semanas) * SEMANAS_POR_MES);
    return {
      profesionalId: b.id,
      nombre: b.nombre,
      sedeIds: [...sedeIds],
      facturacionCentimos: facturacion,
      disponibleMin,
      ocupadoMin,
      libreMin: Math.max(0, disponibleMin - ocupadoMin),
      huecosMin,
      citas: misCitas.length,
      clientes: new Set(misCitas.map((c) => c.clienteId)).size,
      ocupacionPct: pct(ocupadoMin, disponibleMin),
      productividadCentimosHora: disponibleMin > 0 ? Math.round(facturacion / (disponibleMin / 60)) : null,
      ticketMedioCentimos: misCitas.length ? Math.round(facturacion / misCitas.length) : null,
      proyeccionMensualCentimos: proyeccion,
      horasMensuales: Math.round(((disponibleMin / 60) / semanas) * SEMANAS_POR_MES),
      rejilla,
    };
  });

  const sedes = entrada.sedes.map((s) => {
    const r = rejillasSede.get(s.id)!;
    for (let d = 0; d < 7; d++)
      for (let h = 0; h < 24; h++) r.celdas[d][h].barberosMedios = fechasPorDia[d] ? Math.round((r.presencias[d][h] / fechasPorDia[d]) * 10) / 10 : 0;
    return { sedeId: s.id, nombre: s.nombre, rejilla: r.celdas };
  });

  return {
    desde: entrada.desde,
    hasta: entrada.hasta,
    semanas: Math.round(semanas * 10) / 10,
    barberos,
    sedes,
    alertas: generarAlertas(barberos, sedes, semanas),
  };
}

// ---------------------------------------------------------------------
// Alertas (reglas fijas y explicables; el texto con IA vendrá encima)
// ---------------------------------------------------------------------

const FRANJAS: { nombre: string; desde: number; hasta: number }[] = [
  { nombre: "por la mañana", desde: 0, hasta: 14 },
  { nombre: "a primera hora de la tarde", desde: 14, hasta: 17 },
  { nombre: "a última hora de la tarde", desde: 17, hasta: 24 },
];

function sumarFranja<T extends { disponibleMin: number; ocupadoMin: number }>(fila: T[], desde: number, hasta: number) {
  let disp = 0;
  let ocup = 0;
  for (let h = desde; h < hasta; h++) {
    disp += fila[h].disponibleMin;
    ocup += fila[h].ocupadoMin;
  }
  return { disp, ocup };
}

export function generarAlertas(
  barberos: ResumenBarbero[],
  sedes: AnalisisRendimiento["sedes"],
  semanas: number,
): Alerta[] {
  const alertas: Alerta[] = [];
  const semanasTxt = `las últimas ${Math.round(semanas)} semanas`;

  for (const b of barberos) {
    for (const d of ORDEN_DIAS) {
      for (const f of FRANJAS) {
        const { disp, ocup } = sumarFranja(b.rejilla[d], f.desde, f.hasta);
        // Al menos 2 h de media por semana en esa franja para que cuente.
        if (disp / semanas < 120) continue;
        const ocupacion = ocup / disp;
        if (ocupacion < 0.35) {
          alertas.push({
            tipo: "ocupacion_baja",
            prioridad: ocupacion < 0.2 ? 1 : 2,
            profesionalId: b.profesionalId,
            sedeId: null,
            texto: `${b.nombre} tiene una ocupación del ${Math.round(ocupacion * 100)} % los ${DIAS_SEMANA[d].toLowerCase()} ${f.nombre} durante ${semanasTxt} (${Math.round(disp / semanas / 60)} h por semana con poca demanda). Conviene estudiar un cambio de turno.`,
          });
        }
      }
    }
    if (b.disponibleMin > 0 && b.huecosMin / b.disponibleMin > 0.08) {
      alertas.push({
        tipo: "huecos",
        prioridad: 3,
        profesionalId: b.profesionalId,
        sedeId: null,
        texto: `${b.nombre} pierde unas ${Math.round(b.huecosMin / semanas / 60 * 10) / 10} h por semana en huecos sueltos de menos de 30 min entre citas. Agrupar mejor las reservas le daría tiempo vendible.`,
      });
    }
    if (b.disponibleMin > 0 && b.proyeccionMensualCentimos < OBJETIVO_MENSUAL_CENTIMOS) {
      const falta = OBJETIVO_MENSUAL_CENTIMOS - b.proyeccionMensualCentimos;
      alertas.push({
        tipo: "objetivo",
        prioridad: 3,
        profesionalId: b.profesionalId,
        sedeId: null,
        texto: `${b.nombre} va camino de unos ${euros(b.proyeccionMensualCentimos)} al mes: le faltan unos ${euros(falta)} para los 4.000 €.`,
      });
    }
  }

  // Productividad muy por debajo de la mediana del equipo.
  const productividades = barberos.map((b) => b.productividadCentimosHora).filter((p): p is number => p !== null && p > 0).sort((a, b) => a - b);
  if (productividades.length >= 2) {
    const mediana = productividades[Math.floor(productividades.length / 2)];
    for (const b of barberos) {
      if (b.productividadCentimosHora !== null && b.disponibleMin / semanas >= 600 && b.productividadCentimosHora < mediana * 0.75) {
        alertas.push({
          tipo: "productividad_baja",
          prioridad: 2,
          profesionalId: b.profesionalId,
          sedeId: null,
          texto: `${b.nombre} factura ${euros(b.productividadCentimosHora)}/h, bastante por debajo de la media del equipo (${euros(mediana)}/h) para las horas que está.`,
        });
      }
    }
  }

  for (const s of sedes) {
    for (const d of ORDEN_DIAS) {
      for (const f of FRANJAS) {
        const fila = s.rejilla[d];
        const { disp, ocup } = sumarFranja(fila, f.desde, f.hasta);
        if (disp / semanas < 120) continue;
        const ocupacion = ocup / disp;
        let maxBarberos = 0;
        for (let h = f.desde; h < f.hasta; h++) maxBarberos = Math.max(maxBarberos, fila[h].barberosMedios);
        if (ocupacion >= 0.85) {
          alertas.push({
            tipo: "falta_personal",
            prioridad: 1,
            profesionalId: null,
            sedeId: s.sedeId,
            texto: `${s.nombre}: los ${DIAS_SEMANA[d].toLowerCase()} ${f.nombre} la ocupación es del ${Math.round(ocupacion * 100)} %. Probablemente hay clientes que no encuentran hueco: conviene reforzar esa franja.`,
          });
        } else if (ocupacion < 0.4 && maxBarberos >= 2) {
          alertas.push({
            tipo: "sobra_personal",
            prioridad: 2,
            profesionalId: null,
            sedeId: s.sedeId,
            texto: `${s.nombre}: los ${DIAS_SEMANA[d].toLowerCase()} ${f.nombre} hay hasta ${maxBarberos} barberos a la vez con solo un ${Math.round(ocupacion * 100)} % de ocupación. Puede sobrar gente en esa franja.`,
          });
        }
      }
    }
  }

  return alertas.sort((a, b) => a.prioridad - b.prioridad);
}

// "4.000 €" (toLocaleString de es-ES no pone el punto en cifras de 4 dígitos).
export function euros(centimos: number): string {
  const n = Math.round(centimos / 100);
  return `${n < 0 ? "−" : ""}${String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")} €`;
}

// ---------------------------------------------------------------------
// Simulador
// ---------------------------------------------------------------------

export interface ResultadoEscenario {
  horasMensuales: number;
  facturacionMensualCentimos: number;
  ocupacionPct: number | null;
  productividadCentimosHora: number | null;
}

/**
 * Estima un horario semanal distinto para un barbero, a partir de su
 * historial. No es una promesa: es una simulación con supuestos
 * explícitos.
 *
 * `propuesta[dia][hora]` = true si trabajaría esa hora.
 *  - Horas que mantiene: igual que en su historial.
 *  - Horas que deja: pierde esa facturación, pero un % de esos clientes
 *    (`retencion`) se recolocan en sus horas libres que mantiene o gana.
 *  - Horas nuevas: se estiman con la ocupación de la sede en esa hora
 *    (otros barberos), sin pasar del 85 %, y con su propia facturación
 *    por hora ocupada.
 */
export function simularEscenario(
  barbero: ResumenBarbero,
  sede: AnalisisRendimiento["sedes"][number] | null,
  propuesta: boolean[][],
  semanas: number,
  retencion: number,
): ResultadoEscenario {
  const ocupacionMax = 0.9;
  const facturaPorMinOcupado = barbero.ocupadoMin > 0 ? barbero.facturacionCentimos / barbero.ocupadoMin : 0;

  let disp = 0;
  let ocup = 0;
  let ingreso = 0;
  let libreConservada = 0;
  let ocupadoPerdido = 0;
  let ingresoPerdido = 0;

  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const c = barbero.rejilla[d][h];
      const trabajaAhora = c.semanasConTurno > 0;
      const trabajaraDespues = propuesta[d][h];
      const dispSemana = trabajaAhora ? c.disponibleMin / semanas : 60;
      if (trabajaAhora && trabajaraDespues) {
        disp += dispSemana;
        ocup += c.ocupadoMin / semanas;
        ingreso += c.ingresoCentimos / semanas;
        libreConservada += Math.max(0, dispSemana * ocupacionMax - c.ocupadoMin / semanas);
      } else if (trabajaAhora && !trabajaraDespues) {
        ocupadoPerdido += c.ocupadoMin / semanas;
        ingresoPerdido += c.ingresoCentimos / semanas;
      } else if (!trabajaAhora && trabajaraDespues) {
        const s = sede?.rejilla[d][h];
        const ocupacionSede = s && s.disponibleMin > 0 ? Math.min(0.85, s.ocupadoMin / s.disponibleMin) : 0;
        const ocupNueva = 60 * ocupacionSede;
        disp += 60;
        ocup += ocupNueva;
        ingreso += ocupNueva * facturaPorMinOcupado;
        libreConservada += Math.max(0, 60 * ocupacionMax - ocupNueva);
      } else {
        // Citas hechas fuera de su turno habitual (horas extra puntuales):
        // se mantienen tal cual en los dos escenarios.
        ingreso += c.ingresoCentimos / semanas;
      }
    }
  }

  // Clientes de las horas que se dejan y que se recolocan en huecos libres.
  const recolocado = Math.min(ocupadoPerdido * retencion, libreConservada);
  if (ocupadoPerdido > 0) {
    ocup += recolocado;
    ingreso += ingresoPerdido * (recolocado / ocupadoPerdido);
  }

  const horasMes = (disp / 60) * SEMANAS_POR_MES;
  const ingresoMes = ingreso * SEMANAS_POR_MES;
  return {
    horasMensuales: Math.round(horasMes),
    facturacionMensualCentimos: Math.round(ingresoMes),
    ocupacionPct: pct(ocup, disp),
    productividadCentimosHora: horasMes > 0 ? Math.round(ingresoMes / horasMes) : null,
  };
}

/** El horario actual de un barbero como rejilla de true/false. */
export function horarioActual(barbero: ResumenBarbero): boolean[][] {
  return barbero.rejilla.map((fila) => fila.map((c) => c.semanasConTurno > 0));
}
