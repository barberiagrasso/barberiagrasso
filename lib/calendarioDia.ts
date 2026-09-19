// Lógica pura del calendario de la vista de día de la Agenda (columnas
// por barbero + rango de horas visible) — separada del componente para
// poder probarla con tests unitarios, ya que en este entorno no hay
// forma de levantar un navegador contra /api/admin/citas (esa ruta
// necesita la service role key de Supabase, que no está disponible
// aquí) para verlo funcionar de verdad.

import { minutosDeHora } from "@/lib/horarioLocal";

export interface Profesional {
  id: string;
  nombre: string;
  foto_url?: string | null;
}
export interface Horario {
  profesional_id: string;
  hora_inicio: string;
  hora_fin: string;
  descanso_inicio?: string | null;
  descanso_fin?: string | null;
}
export interface CitaParaColumna {
  profesional: { id: string; nombre: string; foto_url?: string | null } | null;
}
export interface DescansoExcepcion {
  profesional_id: string;
  hora_inicio: string;
  hora_fin: string;
}
export interface DescansoResuelto {
  profesional_id: string;
  hora_inicio: string;
  hora_fin: string;
  /** true si es la excepción puntual de ese día (arrastrada), no la regla general. */
  esExcepcion: boolean;
}

/**
 * Descanso para comer que le toca a cada profesional ESE día concreto:
 * la excepción puntual (arrastrada por el admin ese día) si existe, si no
 * la regla general de su horario. Réplica local de `resolverDescansos` de
 * lib/availability.ts — no se puede importar de ahí porque ese módulo
 * tiene "server-only" y este componente es de cliente.
 */
export function resolverDescansosDia(
  horariosDelDia: Horario[],
  excepcionesDelDia: DescansoExcepcion[]
): DescansoResuelto[] {
  const excepcionPorProfesional = new Map(excepcionesDelDia.map((e) => [e.profesional_id, e]));
  const resultado: DescansoResuelto[] = [];
  const yaResueltos = new Set<string>();

  for (const h of horariosDelDia) {
    if (yaResueltos.has(h.profesional_id)) continue;
    yaResueltos.add(h.profesional_id);
    const excepcion = excepcionPorProfesional.get(h.profesional_id);
    if (excepcion) {
      resultado.push({ ...excepcion, esExcepcion: true });
    } else if (h.descanso_inicio && h.descanso_fin) {
      resultado.push({
        profesional_id: h.profesional_id,
        hora_inicio: h.descanso_inicio,
        hora_fin: h.descanso_fin,
        esExcepcion: false,
      });
    }
  }
  return resultado;
}

export const ID_SIN_ASIGNAR = "__sin_asignar__";

/**
 * Columnas a mostrar en el calendario: los profesionales que trabajan
 * ese día (tienen horario en `horarios`) o que ya tienen alguna cita ese
 * día aunque no les tocara turno (una cita puesta a mano, o cubriendo a
 * otro barbero). Si hay alguna cita sin profesional asignado
 * ("cualquiera" al reservar), se añade al final una columna "Sin
 * asignar" para no perderla de vista.
 */
export function columnasVisibles(
  profesionales: Profesional[],
  horarios: Horario[],
  citas: CitaParaColumna[]
): Profesional[] {
  const conTurno = new Set(horarios.map((h) => h.profesional_id));
  const conCita = new Set(citas.filter((c) => c.profesional).map((c) => c.profesional!.id));
  const visibles = profesionales.filter((p) => conTurno.has(p.id) || conCita.has(p.id));

  // Por si una cita apunta a un profesional que ya no está en la lista
  // de la sede (dado de baja, por ejemplo) — que su columna no desaparezca.
  for (const c of citas) {
    if (c.profesional && !visibles.some((v) => v.id === c.profesional!.id)) {
      visibles.push(c.profesional);
    }
  }

  if (citas.some((c) => !c.profesional)) {
    visibles.push({ id: ID_SIN_ASIGNAR, nombre: "Sin asignar" });
  }
  return visibles;
}

function redondearAbajo30(minutos: number) {
  return Math.floor(minutos / 30) * 30;
}
function redondearArriba30(minutos: number) {
  return Math.ceil(minutos / 30) * 30;
}

/**
 * Rango de horas (en minutos desde medianoche) a mostrar en el eje
 * vertical: el de los turnos de las columnas visibles ese día si hay
 * alguno; si no, el de las citas ya puestas; y si tampoco hay nada, un
 * horario por defecto razonable — para que un día vacío no se quede sin
 * eje. Los turnos, redondeados al cuarto de hora más cercano hacia
 * fuera, y con un mínimo de 4 horas de rango para que un turno muy
 * corto no deje una franja ridículamente apretada.
 */
export function rangoHorario(
  columnasIds: string[],
  horarios: Horario[],
  citasConMinutos: { desdeMin: number; hastaMin: number }[]
): { minInicio: number; maxFin: number } {
  const horariosRelevantes = horarios.filter((h) => columnasIds.includes(h.profesional_id));
  if (horariosRelevantes.length > 0) {
    const desde = Math.min(...horariosRelevantes.map((h) => minutosDeHora(h.hora_inicio)));
    const hasta = Math.max(...horariosRelevantes.map((h) => minutosDeHora(h.hora_fin)));
    const minInicio = redondearAbajo30(desde);
    return { minInicio, maxFin: Math.max(redondearArriba30(hasta), minInicio + 240) };
  }
  if (citasConMinutos.length > 0) {
    const desde = Math.min(...citasConMinutos.map((c) => c.desdeMin));
    const hasta = Math.max(...citasConMinutos.map((c) => c.hastaMin));
    return { minInicio: redondearAbajo30(desde), maxFin: redondearArriba30(hasta) };
  }
  return { minInicio: 9 * 60, maxFin: 20 * 60 };
}
