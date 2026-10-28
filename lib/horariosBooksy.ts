// Horarios de trabajo de cada barbero, copiados de Booksy (capturas que
// mandó David el 28/10/2026). Se aplican desde /admin/importar-horarios,
// solo cuando el dueño lo confirma.
// dia: 1 = lunes … 6 = sábado, 0 = domingo (igual que la tabla horarios).

export interface TurnoBooksy {
  dia: number;
  inicio: string;
  fin: string;
  descanso?: [string, string];
}

export interface HorarioBooksy {
  clave: string;
  sede: "ciudades" | "molinos";
  nombre: string; // como sale en Booksy
  turnos: TurnoBooksy[];
}

const t = (dia: number, inicio: string, fin: string, descanso?: [string, string]): TurnoBooksy => ({ dia, inicio, fin, descanso });

export const HORARIOS_BOOKSY: HorarioBooksy[] = [
  // --- Avenida de las Ciudades ---
  {
    clave: "ciudades-david",
    sede: "ciudades",
    nombre: "David Grasso",
    turnos: [t(2, "14:00", "21:00"), t(4, "09:30", "19:00", ["13:00", "14:00"]), t(6, "09:00", "18:00")],
  },
  {
    clave: "ciudades-juan",
    sede: "ciudades",
    nombre: "Juan",
    turnos: [
      t(1, "09:30", "19:00", ["13:00", "15:00"]),
      t(2, "11:00", "21:00", ["14:30", "16:30"]),
      t(3, "10:30", "20:00", ["14:00", "16:00"]),
      t(4, "10:00", "20:00", ["14:00", "16:00"]),
      t(5, "10:00", "20:00", ["14:00", "16:00"]),
      t(6, "09:00", "18:00", ["14:00", "15:30"]),
    ],
  },
  {
    clave: "ciudades-lucas",
    sede: "ciudades",
    nombre: "Lucas",
    turnos: [
      t(1, "12:00", "21:00", ["14:30", "15:30"]),
      t(3, "12:00", "21:00", ["14:30", "15:30"]),
      t(4, "12:00", "21:00", ["14:30", "15:30"]),
      t(5, "12:00", "21:00", ["14:30", "15:30"]),
      t(6, "10:00", "18:00", ["14:00", "15:00"]),
    ],
  },
  {
    clave: "ciudades-cristian",
    sede: "ciudades",
    nombre: "Cristian",
    turnos: [
      t(2, "09:30", "19:00", ["13:30", "14:30"]),
      t(3, "09:30", "19:00", ["13:30", "14:30"]),
      t(4, "09:30", "19:00", ["13:30", "14:30"]),
      t(5, "09:30", "19:00", ["13:30", "14:30"]),
      t(6, "09:00", "18:00", ["13:00", "14:00"]),
    ],
  },
  // --- Los Molinos ---
  {
    clave: "molinos-juan-carlos",
    sede: "molinos",
    nombre: "Juan Carlos",
    turnos: [
      t(1, "09:30", "19:00", ["15:00", "16:00"]),
      t(2, "15:00", "21:00"),
      t(3, "09:30", "19:00", ["15:00", "16:00"]),
      t(4, "09:30", "20:30", ["15:00", "16:00"]),
      t(5, "09:30", "21:00", ["15:00", "16:00"]),
      t(6, "09:00", "15:00", ["13:00", "14:00"]),
    ],
  },
  {
    clave: "molinos-alejandro",
    sede: "molinos",
    nombre: "Alejandro",
    turnos: [
      t(1, "16:00", "21:00"),
      t(2, "16:00", "21:00"),
      t(3, "16:00", "21:00"),
      t(4, "16:00", "21:00"),
      t(5, "10:00", "21:00", ["15:00", "16:00"]),
      t(6, "09:00", "18:00", ["13:00", "14:00"]),
    ],
  },
  {
    clave: "molinos-daniel",
    sede: "molinos",
    nombre: "Daniel Andrés",
    turnos: [
      t(1, "12:00", "21:00", ["15:00", "16:00"]),
      t(2, "12:00", "21:00", ["15:00", "16:00"]),
      t(3, "12:00", "21:00", ["15:00", "16:00"]),
      t(4, "12:00", "21:00", ["15:00", "16:00"]),
      t(5, "12:00", "21:00", ["15:00", "16:00"]),
      t(6, "10:00", "18:00", ["14:00", "15:00"]),
    ],
  },
  {
    clave: "molinos-david",
    sede: "molinos",
    nombre: "David Grasso",
    turnos: [t(1, "14:00", "21:00"), t(3, "14:00", "21:00"), t(5, "09:30", "19:00", ["13:30", "14:30"])],
  },
  {
    clave: "molinos-arthur",
    sede: "molinos",
    nombre: "Arthur",
    turnos: [
      t(1, "12:00", "21:00", ["14:00", "15:00"]),
      t(2, "09:30", "19:00", ["14:00", "15:00"]),
      t(3, "12:00", "20:00", ["14:00", "15:00"]),
      t(4, "12:00", "21:00", ["14:00", "15:00"]),
      t(5, "12:00", "21:00", ["14:00", "15:00"]),
      t(6, "10:00", "18:00", ["13:00", "14:00"]),
    ],
  },
];

export function normalizarNombre(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** El barbero de la app con el mismo nombre (sin tildes ni mayúsculas). Solo coincidencia exacta: "Juan" no es "Juan Carlos". */
export function emparejarBarbero(nombre: string, profesionales: { id: string; nombre: string }[]): string | null {
  const n = normalizarNombre(nombre);
  const exactos = profesionales.filter((p) => normalizarNombre(p.nombre) === n);
  if (exactos.length === 1) return exactos[0].id;
  // "David Grasso" en Booksy puede ser solo "David" en la app, si no hay ambigüedad.
  const palabras = n.split(" ");
  if (palabras.length < 2) return null;
  const porNombre = profesionales.filter((p) => normalizarNombre(p.nombre) === palabras[0]);
  return porNombre.length === 1 ? porNombre[0].id : null;
}

export function emparejarSede(clave: "ciudades" | "molinos", sedes: { id: string; nombre: string }[]): string | null {
  return sedes.find((s) => normalizarNombre(s.nombre).includes(clave))?.id ?? null;
}
