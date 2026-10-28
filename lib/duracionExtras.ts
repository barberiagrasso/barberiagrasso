// Extras muy cortos (cejas, depilación de nariz…, de 1 a 5 minutos) se
// hacen dentro del tiempo del corte o del corte y barba: no alargan la
// cita en la agenda ni quitan huecos (pedido de David, 28/10/2026). Se
// siguen cobrando y apareciendo en la cita y el recibo igual.
export const MINUTOS_EXTRA_SIN_TIEMPO = 5;

/** Minutos que un extra ocupa en la agenda. */
export function minutosAgendaExtra(duracionMinutos: number | null | undefined): number {
  const d = duracionMinutos ?? 0;
  return d <= MINUTOS_EXTRA_SIN_TIEMPO ? 0 : d;
}

/** Minutos que suman en la agenda varios extras juntos. */
export function minutosAgendaExtras(extras: { duracion_minutos: number | null | undefined }[]): number {
  return extras.reduce((acc, e) => acc + minutosAgendaExtra(e.duracion_minutos), 0);
}
