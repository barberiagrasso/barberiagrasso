"use client";

import { useEffect, useMemo, useState } from "react";
import type { Sede, Servicio, FranjaDisponible, ResumenDiaDisponibilidad } from "@/lib/types";
import { GrassoMark } from "@/components/brand/GrassoMark";
import { AvatarProfesional } from "@/components/brand/AvatarProfesional";

// Cuántos meses hacia delante del actual se puede navegar en el
// calendario de reserva (0 = solo el mes en curso).
const MESES_ADELANTE_MAX = 2;
const NOMBRES_DIA_SEMANA = ["L", "M", "X", "J", "V", "S", "D"];

type Paso = "sede" | "servicio" | "complementos" | "fecha" | "datos" | "confirmado";

// Los servicios "principales" (categoria = null) se muestran siempre
// directamente en el paso de reserva. El resto vive dentro de un
// desplegable según su `categoria` — este orden es el que pidió Diego;
// una categoría que no esté aquí se coloca al final, alfabéticamente.
const CATEGORIAS_ORDEN = [
  "Grasso Kids (hasta 7 años)",
  "Complementos",
  "Tintes Grasso",
  "Tratamientos capilares",
  "Packs Grasso",
];
const CATEGORIA_COMPLEMENTOS = "Complementos";

function esComplemento(servicio: Servicio) {
  return servicio.categoria === CATEGORIA_COMPLEMENTOS;
}

function agruparServicios(servicios: Servicio[]) {
  const principales = servicios
    .filter((s) => !s.categoria)
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));

  const porCategoria = new Map<string, Servicio[]>();
  for (const s of servicios) {
    if (!s.categoria) continue;
    if (!porCategoria.has(s.categoria)) porCategoria.set(s.categoria, []);
    porCategoria.get(s.categoria)!.push(s);
  }
  for (const items of porCategoria.values()) {
    items.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  }

  const nombresCategorias = Array.from(porCategoria.keys()).sort((a, b) => {
    const ia = CATEGORIAS_ORDEN.indexOf(a);
    const ib = CATEGORIAS_ORDEN.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  const grupos = nombresCategorias.map((nombre) => ({ nombre, items: porCategoria.get(nombre)! }));
  return { principales, grupos };
}

interface ProfesionalOpcion {
  id: string;
  nombre: string;
  foto_url?: string | null;
}

interface ClienteInicial {
  nombre: string;
  telefono: string;
  email: string | null;
  // Saldo de fidelización acumulado (10% de lo gastado en citas
  // anteriores) — ver lib/fidelizacion.ts. Se puede canjear en esta
  // reserva solo si cubre el total exacto.
  saldoFidelizacionCentimos: number;
}

interface Props {
  sedes: Sede[];
  servicios: Servicio[];
  // Datos del cliente ya logueado, para no hacérselos volver a escribir.
  // Se dejan en campos editables por si alguna vez reserva para otra
  // persona (p. ej. un hijo).
  clienteInicial?: ClienteInicial;
}

function formatearPrecio(centimos: number) {
  return (centimos / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

// Para servicios de precio variable (Rastas, tintes...): precio_centimos
// sigue siendo el mínimo/orientativo de catálogo, pero se muestra como
// "Desde X€" para no dar la impresión de un precio cerrado — el precio
// real se decide al cerrar la cita en el panel.
function formatearPrecioServicio(centimos: number, esVariable: boolean) {
  return (esVariable ? "Desde " : "") + formatearPrecio(centimos);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function fechaISO(anio: number, mes: number, dia: number): string {
  return `${anio}-${pad2(mes)}-${pad2(dia)}`;
}

function hoyLocalISO(): string {
  const hoy = new Date();
  return fechaISO(hoy.getFullYear(), hoy.getMonth() + 1, hoy.getDate());
}

// Índice absoluto de mes (año*12 + mes 0-indexado) — hace trivial comparar
// y limitar la navegación del calendario sin líos de fin de año.
function indiceMes(anio: number, mes: number): number {
  return anio * 12 + (mes - 1);
}

// Rejilla de celdas de un mes en semanas de lunes a domingo (convención
// española), con `null` en los huecos antes del día 1 y después del
// último día, para que la cuadrícula siempre tenga columnas completas.
function celdasDelMes(anio: number, mes: number): (number | null)[] {
  const primerDia = new Date(anio, mes - 1, 1);
  const totalDias = new Date(anio, mes, 0).getDate();
  const offset = (primerDia.getDay() + 6) % 7; // lunes=0 ... domingo=6
  const celdas: (number | null)[] = Array(offset).fill(null);
  for (let d = 1; d <= totalDias; d++) celdas.push(d);
  while (celdas.length % 7 !== 0) celdas.push(null);
  return celdas;
}

function nombreMes(anio: number, mes: number): string {
  return new Date(anio, mes - 1, 1).toLocaleDateString("es-ES", { month: "long" });
}

function colorBarraNivel(nivel: ResumenDiaDisponibilidad["nivel"] | undefined): string {
  switch (nivel) {
    case "alta":
      return "bg-emerald-500";
    case "media":
      return "bg-amber-400";
    case "baja":
      return "bg-red-500";
    default:
      return "bg-transparent";
  }
}

// ---------------------------------------------------------------------
// Piezas de UI reutilizables, con la estética de marca ya aplicada
// (negro / blanco cálido / amarillo pastel + jerarquía tipográfica).
// ---------------------------------------------------------------------

function PasoTitulo({ children }: { children: React.ReactNode }) {
  return <h2 className="font-heading text-2xl italic text-brand-white">{children}</h2>;
}

function TarjetaOpcion({
  seleccionado,
  onClick,
  children,
}: {
  seleccionado?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "w-full rounded-xl border p-4 text-left transition-colors " +
        (seleccionado
          ? "border-brand-yellow bg-brand-yellow text-brand-yellow-ink"
          : "border-brand-line bg-brand-black-soft text-brand-white hover:border-brand-yellow/60 hover:bg-white/[0.04]")
      }
    >
      {children}
    </button>
  );
}

// Tab de servicio/extra: fondo blanco, todo el texto en negro y borde
// amarillo. Fila clásica de carta de precios — nombre a la izquierda,
// precio en negrita a la derecha, ambos centrados en el eje vertical de
// la tarjeta; la duración y la nota (p. ej. "con David Grasso") van
// debajo del nombre, en un tamaño menor y más discretas. Cuando está
// seleccionado (paso de extras, multi-selección) se marca con una
// insignia en la esquina en vez de "ensuciar" el nombre.
function TarjetaServicio({
  servicio,
  extra,
  seleccionado,
  onClick,
}: {
  servicio: Servicio;
  extra?: boolean;
  seleccionado?: boolean;
  onClick: () => void;
}) {
  const meta = [`${extra ? "+" : ""}${servicio.duracion_minutos} min`, servicio.descripcion]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      onClick={onClick}
      className={
        "relative flex w-full items-center justify-between gap-4 rounded-xl border-2 bg-white px-4 py-3 text-left transition-colors " +
        (seleccionado
          ? "border-brand-yellow shadow-[0_2px_10px_rgba(0,0,0,0.14)]"
          : "border-brand-yellow/50 hover:border-brand-yellow")
      }
    >
      {seleccionado && (
        <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-yellow text-[11px] leading-none text-brand-yellow-ink shadow-sm">
          ✓
        </span>
      )}
      <div className="min-w-0">
        <p className="truncate font-heading text-sm text-black">{servicio.nombre}</p>
        {meta && <p className="mt-0.5 truncate font-body text-[11px] text-black/50">{meta}</p>}
      </div>
      <p className="shrink-0 font-mono text-base tabular-nums text-black">
        {extra && !servicio.precio_variable ? "+" : ""}
        {formatearPrecioServicio(servicio.precio_centimos, Boolean(servicio.precio_variable))}
      </p>
    </button>
  );
}

function BotonPrimario({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-full bg-brand-yellow px-6 py-2.5 text-sm font-semibold uppercase tracking-wide text-brand-yellow-ink transition-colors hover:bg-brand-yellow-dark disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function EnlaceVolver({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="font-body text-sm text-brand-white-dim underline decoration-brand-line underline-offset-4 transition-colors hover:text-brand-yellow"
    >
      {children}
    </button>
  );
}

// El recorrido completo, de principio a fin — el último nodo es la
// propia cita confirmada, así queda claro que todos los pasos llevan
// hacia ahí y no son una simple selección de filtros.
const PASOS: { clave: Paso; etiqueta: string }[] = [
  { clave: "sede", etiqueta: "Sede" },
  { clave: "servicio", etiqueta: "Servicio" },
  { clave: "complementos", etiqueta: "Extras" },
  { clave: "fecha", etiqueta: "Barbero y fecha" },
  { clave: "datos", etiqueta: "Datos" },
  { clave: "confirmado", etiqueta: "Cita confirmada" },
];

function Stepper({ paso }: { paso: Paso }) {
  const indiceActual = PASOS.findIndex((p) => p.clave === paso);
  return (
    <div className="mb-7">
      <ol className="flex items-center">
        {PASOS.map((p, i) => {
          const completado = i < indiceActual;
          const actual = i === indiceActual;
          return (
            <li key={p.clave} className="flex flex-1 items-center last:flex-none">
              <span
                aria-current={actual ? "step" : undefined}
                className={
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border font-mono text-[11px] transition-colors " +
                  (completado
                    ? "border-brand-yellow bg-brand-yellow text-brand-yellow-ink"
                    : actual
                      ? "border-brand-yellow bg-transparent text-brand-yellow ring-2 ring-brand-yellow/30"
                      : "border-brand-line text-brand-white-dim")
                }
              >
                {completado ? "✓" : i + 1}
              </span>
              {i < PASOS.length - 1 && (
                <span className={"mx-1 h-px flex-1 " + (completado ? "bg-brand-yellow" : "bg-brand-line")} />
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-center font-mono text-[11px] uppercase tracking-wider text-brand-white-dim">
        Paso {indiceActual + 1} de {PASOS.length} ·{" "}
        <span className="text-brand-yellow">{PASOS[indiceActual].etiqueta}</span>
      </p>
    </div>
  );
}

export default function BookingFlow({ sedes, servicios, clienteInicial }: Props) {
  const [paso, setPaso] = useState<Paso>("sede");
  const [sedeId, setSedeId] = useState<string | null>(null);
  const [servicioId, setServicioId] = useState<string | null>(null);
  const [grupoAbierto, setGrupoAbierto] = useState<string | null>(null);
  const [complementoIds, setComplementoIds] = useState<string[]>([]);
  const [profesionalId, setProfesionalId] = useState<string | null>(null); // null = cualquiera
  const [profesionales, setProfesionales] = useState<ProfesionalOpcion[]>([]);
  const [fecha, setFecha] = useState<string | null>(null);
  const [slots, setSlots] = useState<FranjaDisponible[]>([]);
  const [cargandoSlots, setCargandoSlots] = useState(false);
  const hoy = useMemo(() => new Date(), []);
  const [mesVisible, setMesVisible] = useState(() => ({
    anio: hoy.getFullYear(),
    mes: hoy.getMonth() + 1,
  }));
  const [resumenMes, setResumenMes] = useState<Record<string, ResumenDiaDisponibilidad>>({});
  const [cargandoMes, setCargandoMes] = useState(false);
  const [slotElegido, setSlotElegido] = useState<FranjaDisponible | null>(null);
  const [nombre, setNombre] = useState(clienteInicial?.nombre ?? "");
  const [telefono, setTelefono] = useState(clienteInicial?.telefono ?? "");
  const [email, setEmail] = useState(clienteInicial?.email ?? "");
  const [aceptaComercial, setAceptaComercial] = useState(true);
  const [pagarConSaldo, setPagarConSaldo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [citaConfirmada, setCitaConfirmada] = useState<{ inicio: string; profesionalNombre: string } | null>(null);
  const [mostrarFormListaEspera, setMostrarFormListaEspera] = useState(false);
  const [flexibilidadListaEspera, setFlexibilidadListaEspera] = useState<0 | 1 | 2>(0);
  const [enviandoListaEspera, setEnviandoListaEspera] = useState(false);
  const [errorListaEspera, setErrorListaEspera] = useState<string | null>(null);
  const [listaEsperaApuntada, setListaEsperaApuntada] = useState(false);
  const [buscandoProximo, setBuscandoProximo] = useState(false);
  const [errorProximo, setErrorProximo] = useState<string | null>(null);

  const sedeSeleccionada = sedes.find((s) => s.id === sedeId);
  const servicioSeleccionado = servicios.find((s) => s.id === servicioId);
  const { principales, grupos } = useMemo(() => agruparServicios(servicios), [servicios]);
  const complementosDisponibles = useMemo(() => servicios.filter(esComplemento), [servicios]);
  const complementosElegidos = useMemo(
    () => complementosDisponibles.filter((c) => complementoIds.includes(c.id)),
    [complementosDisponibles, complementoIds]
  );
  const duracionExtraMinutos = complementosElegidos.reduce((acc, c) => acc + c.duracion_minutos, 0);
  const precioTotalCentimos =
    (servicioSeleccionado?.precio_centimos ?? 0) +
    complementosElegidos.reduce((acc, c) => acc + c.precio_centimos, 0);
  // Si el servicio principal o algún complemento es de precio variable,
  // precioTotalCentimos deja de ser "el total exacto" y pasa a ser solo
  // una referencia mínima — se muestra con "Desde" (ver
  // formatearPrecioServicio) y no se puede pagar con saldo, porque el
  // canje exige cubrir el importe exacto (ver lib/fidelizacion.ts) y aquí
  // todavía no se sabe cuál va a ser.
  const totalEsVariable = Boolean(servicioSeleccionado?.precio_variable) || complementosElegidos.some((c) => c.precio_variable);
  const saldoDisponibleCentimos = clienteInicial?.saldoFidelizacionCentimos ?? 0;
  // El canje no admite parcialidad: el saldo tiene que cubrir el total
  // exacto de la cita, o no se puede usar en absoluto (ver lib/fidelizacion.ts).
  const saldoCubreTotal = !totalEsVariable && precioTotalCentimos > 0 && saldoDisponibleCentimos >= precioTotalCentimos;

  // Si el cliente marcó "pagar con saldo" y luego cambia de servicio o
  // añade un complemento que ya no le cubre el saldo, se desmarca solo:
  // así el estado interno nunca se queda "marcado" por detrás de una
  // casilla que ahora se ve deshabilitada.
  useEffect(() => {
    if (pagarConSaldo && !saldoCubreTotal) setPagarConSaldo(false);
  }, [pagarConSaldo, saldoCubreTotal]);

  async function elegirServicioYContinuar(id: string) {
    setServicioId(id);
    setComplementoIds([]);
    const servicio = servicios.find((s) => s.id === id);
    // Si el servicio elegido ya es un complemento (se reserva solo), no
    // tiene sentido ofrecer añadirle otro complemento encima.
    setPaso(servicio && esComplemento(servicio) ? "fecha" : "complementos");
    if (sedeId) {
      const res = await fetch(`/api/profesionales?sedeId=${sedeId}&servicioId=${id}`);
      const json = await res.json();
      setProfesionales(json.profesionales ?? []);
    }
  }

  function alternarComplemento(id: string) {
    setComplementoIds((actuales) =>
      actuales.includes(id) ? actuales.filter((c) => c !== id) : [...actuales, id]
    );
  }

  // Recibe el profesional explícitamente (en vez de leerlo del estado) para
  // evitar que, al cambiar de barbero y refrescar huecos en el mismo clic,
  // se use por error el valor de profesionalId de antes de la actualización.
  async function buscarSlots(fechaValor: string, profId: string | null) {
    setSlotElegido(null);
    setCargandoSlots(true);
    setSlots([]);
    const params = new URLSearchParams({
      sedeId: sedeId!,
      servicioId: servicioId!,
      fecha: fechaValor,
    });
    if (profId) params.set("profesionalId", profId);
    if (duracionExtraMinutos > 0) params.set("duracionExtraMinutos", String(duracionExtraMinutos));
    const res = await fetch(`/api/disponibilidad?${params.toString()}`);
    const json = await res.json();
    setCargandoSlots(false);
    setSlots(json.slots ?? []);
  }

  function elegirFecha(valor: string) {
    setFecha(valor);
    buscarSlots(valor, profesionalId);
    // Cada día es una lista de espera distinta: al cambiar de fecha se
    // limpia cualquier formulario/confirmación que quedara del día anterior.
    setMostrarFormListaEspera(false);
    setFlexibilidadListaEspera(0);
    setListaEsperaApuntada(false);
    setErrorListaEspera(null);
    setErrorProximo(null);
  }

  async function apuntarseAListaEspera() {
    if (!sedeId || !servicioId || !fecha || !nombre || !telefono) return;
    setEnviandoListaEspera(true);
    setErrorListaEspera(null);
    try {
      const res = await fetch("/api/lista-espera", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sedeId,
          servicioId,
          profesionalId,
          fecha,
          flexibilidadDias: flexibilidadListaEspera,
          cliente: { nombre, telefono, email: email || null },
          aceptaComercial,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorListaEspera(json.error || "No se pudo apuntar a la lista de espera.");
        return;
      }
      setListaEsperaApuntada(true);
    } catch {
      setErrorListaEspera("No se pudo conectar con el servidor. Inténtalo de nuevo.");
    } finally {
      setEnviandoListaEspera(false);
    }
  }

  // Botón "Próximos espacios": salta directamente al primer día posterior
  // con hueco (con el barbero elegido, o "Cualquiera" si no se eligió
  // ninguno) y deja ya seleccionados ese día y su primer hueco.
  async function buscarProximoDisponible() {
    if (!sedeId || !servicioId || !fecha) return;
    setBuscandoProximo(true);
    setErrorProximo(null);
    try {
      const params = new URLSearchParams({ sedeId, servicioId, desde: fecha });
      if (profesionalId) params.set("profesionalId", profesionalId);
      if (duracionExtraMinutos > 0) params.set("duracionExtraMinutos", String(duracionExtraMinutos));
      const res = await fetch(`/api/disponibilidad/proximo?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) {
        setErrorProximo(json.error || "No se pudo buscar el próximo hueco.");
        return;
      }
      const [anioNuevo, mesNuevo] = json.fecha.split("-").map(Number);
      setMesVisible({ anio: anioNuevo, mes: mesNuevo });
      setFecha(json.fecha);
      setSlots(json.slots ?? []);
      setSlotElegido(json.slots?.[0] ?? null);
      setMostrarFormListaEspera(false);
      setFlexibilidadListaEspera(0);
      setListaEsperaApuntada(false);
      setErrorListaEspera(null);
    } catch {
      setErrorProximo("No se pudo conectar con el servidor. Inténtalo de nuevo.");
    } finally {
      setBuscandoProximo(false);
    }
  }

  // Cambiar de barbero: "Cualquiera" (id null) agrega la disponibilidad de
  // todo el equipo optimizando el primer hueco libre; un barbero concreto
  // filtra a solo su propia agenda. Si ya había un día elegido, se
  // recalculan los huecos al momento para ese mismo día.
  function elegirProfesional(id: string | null) {
    setProfesionalId(id);
    if (fecha) buscarSlots(fecha, id);
  }

  // Trae, de una sola vez, el resumen de disponibilidad de cada día del
  // mes visible (para las barritas verde/amarilla/roja del calendario).
  // Si el día ya elegido deja de tener huecos con el nuevo barbero o mes,
  // se deselecciona en vez de dejar una hora "elegida" que ya no existe.
  async function buscarResumenMes(anio: number, mes: number, profId: string | null) {
    setCargandoMes(true);
    const params = new URLSearchParams({
      sedeId: sedeId!,
      servicioId: servicioId!,
      anio: String(anio),
      mes: String(mes),
    });
    if (profId) params.set("profesionalId", profId);
    if (duracionExtraMinutos > 0) params.set("duracionExtraMinutos", String(duracionExtraMinutos));
    const res = await fetch(`/api/disponibilidad/mes?${params.toString()}`);
    const json = await res.json();
    setCargandoMes(false);
    const mapa: Record<string, ResumenDiaDisponibilidad> = {};
    for (const d of json.dias ?? []) mapa[d.fecha] = d;
    setResumenMes(mapa);
    if (fecha && !mapa[fecha]?.seleccionable) {
      setFecha(null);
      setSlots([]);
      setSlotElegido(null);
    }
  }

  useEffect(() => {
    if (paso !== "fecha" || !sedeId || !servicioId) return;
    // Si el día que ya estaba elegido ya no es válido en este mes/barbero
    // (por ejemplo, al cambiar de barbero y quedarse sin huecos), se limpia
    // dentro de buscarResumenMes.
    void buscarResumenMes(mesVisible.anio, mesVisible.mes, profesionalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso, mesVisible.anio, mesVisible.mes, profesionalId, sedeId, servicioId]);

  const indiceMesVisible = indiceMes(mesVisible.anio, mesVisible.mes);
  const indiceMesActual = indiceMes(hoy.getFullYear(), hoy.getMonth() + 1);
  const puedeRetrocederMes = indiceMesVisible > indiceMesActual;
  const puedeAvanzarMes = indiceMesVisible < indiceMesActual + MESES_ADELANTE_MAX;

  function cambiarMes(delta: number) {
    setMesVisible((actual) => {
      let mes = actual.mes + delta;
      let anio = actual.anio;
      if (mes < 1) {
        mes = 12;
        anio -= 1;
      } else if (mes > 12) {
        mes = 1;
        anio += 1;
      }
      return { anio, mes };
    });
  }

  // Solo una franja horaria por hora visible (si "cualquiera" hay varios
  // profesionales libres a la misma hora, se muestra una sola opción).
  const horasUnicas = useMemo(() => {
    const mapa = new Map<string, FranjaDisponible>();
    for (const s of slots) {
      if (!mapa.has(s.hora_inicio)) mapa.set(s.hora_inicio, s);
    }
    return Array.from(mapa.values());
  }, [slots]);

  async function confirmarReserva() {
    if (!slotElegido || !sedeId || !servicioId || !fecha) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/citas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sedeId,
          servicioId,
          profesionalId: profesionalId || slotElegido.profesional_id,
          fecha,
          horaInicioISO: slotElegido.hora_inicio,
          cliente: { nombre, telefono, email: email || null },
          aceptaComercial,
          complementoIds,
          pagarConSaldo: pagarConSaldo && saldoCubreTotal,
          // Si profesionalId sigue siendo null aquí es que se quedó en
          // "Cualquiera": el barbero de arriba es el que tocó al buscar
          // hueco, no uno que el cliente pidiera a propósito.
          profesionalElegidoPorCliente: profesionalId !== null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "No se pudo confirmar la reserva.");
        return;
      }
      setCitaConfirmada({
        inicio: json.cita.inicio,
        profesionalNombre: json.profesionalNombre,
      });
      setPaso("confirmado");
    } catch {
      setError("No se pudo conectar con el servidor. Inténtalo de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="rounded-3xl border border-brand-line bg-brand-black-soft/60 p-5 shadow-2xl shadow-black/40 sm:p-8">
      <Stepper paso={paso} />

      {paso === "sede" && (
        <div className="space-y-3">
          <PasoTitulo>Elige tu sede</PasoTitulo>
          {sedes.map((sede) => (
            <TarjetaOpcion
              key={sede.id}
              onClick={() => {
                setSedeId(sede.id);
                setPaso("servicio");
              }}
            >
              <div className="font-heading text-lg">{sede.nombre}</div>
              {sede.direccion && <div className="mt-0.5 font-body text-sm opacity-70">{sede.direccion}</div>}
            </TarjetaOpcion>
          ))}
        </div>
      )}

      {paso === "servicio" && (
        <div className="space-y-3">
          <PasoTitulo>Servicios en {sedeSeleccionada?.nombre}</PasoTitulo>

          <div className="space-y-3">
            {principales.map((servicio) => (
              <TarjetaServicio
                key={servicio.id}
                servicio={servicio}
                onClick={() => elegirServicioYContinuar(servicio.id)}
              />
            ))}
          </div>

          {grupos.length > 0 && (
            <div className="space-y-2 pt-1">
              {grupos.map((grupo) => {
                const abierto = grupoAbierto === grupo.nombre;
                return (
                  <div key={grupo.nombre} className="rounded-xl border border-brand-line">
                    <button
                      onClick={() => setGrupoAbierto(abierto ? null : grupo.nombre)}
                      className="flex w-full items-center justify-between px-4 py-3 text-left"
                    >
                      <span className="font-mono text-xs uppercase tracking-wider text-brand-yellow">
                        {grupo.nombre}
                      </span>
                      <span className="font-mono text-xs text-brand-white-dim">{abierto ? "−" : "+"}</span>
                    </button>
                    {abierto && (
                      <div className="space-y-2 border-t border-brand-line p-3">
                        {grupo.items.map((servicio) => (
                          <div key={servicio.id}>
                            {grupo.nombre === "Tratamientos capilares" &&
                              servicio.nombre.toLowerCase().includes("rastas") && (
                                <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-brand-white-dim">
                                  Rastas
                                </p>
                              )}
                            <TarjetaServicio
                              servicio={servicio}
                              onClick={() => elegirServicioYContinuar(servicio.id)}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <EnlaceVolver onClick={() => setPaso("sede")}>← Cambiar de sede</EnlaceVolver>
        </div>
      )}

      {paso === "complementos" && (
        <div className="space-y-3">
          <PasoTitulo>¿Algún complemento?</PasoTitulo>
          <p className="font-body text-sm text-brand-white-dim">
            Opcional — se suman a tu {servicioSeleccionado?.nombre.toLowerCase()} en la misma cita.
          </p>
          <div className="space-y-3">
            {complementosDisponibles.map((c) => (
              <TarjetaServicio
                key={c.id}
                servicio={c}
                extra
                seleccionado={complementoIds.includes(c.id)}
                onClick={() => alternarComplemento(c.id)}
              />
            ))}
          </div>
          {complementosElegidos.length > 0 && (
            <p className="font-mono text-sm text-brand-yellow">
              Total con complementos: {formatearPrecioServicio(precioTotalCentimos, totalEsVariable)} (
              {(servicioSeleccionado?.duracion_minutos ?? 0) + duracionExtraMinutos} min)
            </p>
          )}
          <div className="flex items-center justify-between pt-1">
            <EnlaceVolver onClick={() => setPaso("servicio")}>← Cambiar de servicio</EnlaceVolver>
            <BotonPrimario onClick={() => setPaso("fecha")}>
              {complementosElegidos.length > 0 ? "Continuar" : "Sin complementos"}
            </BotonPrimario>
          </div>
        </div>
      )}

      {paso === "fecha" && (
        <div className="space-y-4">
          <PasoTitulo>Barbero, día y hora</PasoTitulo>

          <div>
            <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-brand-white-dim">
              Barbero
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => elegirProfesional(null)}
                className={
                  "rounded-full border px-3 py-2 font-mono text-xs transition-colors " +
                  (profesionalId === null
                    ? "border-brand-yellow bg-brand-yellow text-brand-yellow-ink"
                    : "border-brand-line text-brand-white hover:border-brand-yellow/60")
                }
              >
                Cualquiera
              </button>
              {profesionales.map((p) => (
                <button
                  key={p.id}
                  onClick={() => elegirProfesional(p.id)}
                  className={
                    "flex items-center gap-1.5 rounded-full border py-1.5 pl-1.5 pr-3 font-mono text-xs transition-colors " +
                    (profesionalId === p.id
                      ? "border-brand-yellow bg-brand-yellow text-brand-yellow-ink"
                      : "border-brand-line text-brand-white hover:border-brand-yellow/60")
                  }
                >
                  <AvatarProfesional fotoUrl={p.foto_url} nombre={p.nombre} className="h-6 w-6" />
                  {p.nombre}
                </button>
              ))}
            </div>
            {profesionalId === null && (
              <p className="mt-1 font-body text-xs text-brand-white-dim">
                Se muestran los huecos de todo el equipo, para encontrarte hora lo antes posible.
              </p>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <button
                onClick={() => cambiarMes(-1)}
                disabled={!puedeRetrocederMes}
                aria-label="Mes anterior"
                className="rounded-full border border-brand-line px-2.5 py-1 font-mono text-sm text-brand-white transition-colors hover:border-brand-yellow/60 disabled:cursor-not-allowed disabled:opacity-30"
              >
                ‹
              </button>
              <p className="font-mono text-xs uppercase tracking-wider text-brand-white-dim">
                {nombreMes(mesVisible.anio, mesVisible.mes)} {mesVisible.anio}
                {cargandoMes && "…"}
              </p>
              <button
                onClick={() => cambiarMes(1)}
                disabled={!puedeAvanzarMes}
                aria-label="Mes siguiente"
                className="rounded-full border border-brand-line px-2.5 py-1 font-mono text-sm text-brand-white transition-colors hover:border-brand-yellow/60 disabled:cursor-not-allowed disabled:opacity-30"
              >
                ›
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center font-mono text-[10px] uppercase tracking-wider text-brand-white-dim">
              {NOMBRES_DIA_SEMANA.map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {celdasDelMes(mesVisible.anio, mesVisible.mes).map((dia, i) => {
                if (dia === null) return <div key={`vacio-${i}`} />;
                const fechaCelda = fechaISO(mesVisible.anio, mesVisible.mes, dia);
                const resumenDia = resumenMes[fechaCelda];
                const esPasado = fechaCelda < hoyLocalISO();
                const seleccionable = !esPasado && !!resumenDia?.seleccionable;
                const elegido = fecha === fechaCelda;
                return (
                  <button
                    key={fechaCelda}
                    disabled={!seleccionable}
                    onClick={() => elegirFecha(fechaCelda)}
                    className={
                      "flex flex-col items-center gap-1 rounded-lg border px-1 py-2 font-mono text-xs transition-colors " +
                      (!seleccionable
                        ? "border-transparent text-brand-white-dim/30"
                        : elegido
                          ? "border-brand-yellow bg-brand-yellow text-brand-yellow-ink"
                          : "border-brand-line text-brand-white hover:border-brand-yellow/60")
                    }
                  >
                    <span>{dia}</span>
                    <span
                      className={
                        "block h-1 w-4 rounded-full " +
                        (seleccionable ? colorBarraNivel(resumenDia?.nivel) : "bg-transparent")
                      }
                    />
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-3 font-mono text-[10px] uppercase tracking-wider text-brand-white-dim">
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Alta
              </span>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Media
              </span>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> Baja
              </span>
            </div>
          </div>

          {fecha && cargandoSlots && <p className="font-body text-sm text-brand-white-dim">Buscando huecos…</p>}
          {fecha && !cargandoSlots && horasUnicas.length === 0 && (
            <div className="space-y-3 rounded-xl border border-brand-line bg-black/20 p-4">
              <p className="font-body text-sm text-brand-white-dim">No hay huecos ese día.</p>

              {listaEsperaApuntada ? (
                <p className="font-body text-sm text-brand-yellow">
                  ¡Listo! En cuanto se libere un hueco que encaje te reservaremos la cita y te avisaremos por
                  WhatsApp.
                </p>
              ) : mostrarFormListaEspera ? (
                <div className="space-y-3">
                  <div>
                    <p className="mb-1.5 font-body text-xs text-brand-white-dim">¿Qué fecha te interesa?</p>
                    <div className="flex flex-wrap gap-2">
                      {(
                        [
                          { valor: 0, etiqueta: "Fecha exacta" },
                          { valor: 1, etiqueta: "+/- 1 día" },
                          { valor: 2, etiqueta: "+/- 2 días" },
                        ] as const
                      ).map((opcion) => (
                        <button
                          key={opcion.valor}
                          onClick={() => setFlexibilidadListaEspera(opcion.valor)}
                          className={
                            "rounded-full border px-3 py-1.5 font-body text-xs transition-colors " +
                            (flexibilidadListaEspera === opcion.valor
                              ? "border-brand-yellow bg-brand-yellow text-brand-yellow-ink"
                              : "border-brand-line text-brand-white hover:border-brand-yellow/60")
                          }
                        >
                          {opcion.etiqueta}
                        </button>
                      ))}
                    </div>
                  </div>
                  <input
                    className="w-full rounded-lg border border-brand-line bg-transparent p-2.5 font-body text-sm text-brand-white placeholder:text-brand-white-dim focus:border-brand-yellow focus:outline-none"
                    placeholder="Nombre y apellidos"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                  />
                  <input
                    className="w-full rounded-lg border border-brand-line bg-transparent p-2.5 font-body text-sm text-brand-white placeholder:text-brand-white-dim focus:border-brand-yellow focus:outline-none"
                    placeholder="Teléfono (WhatsApp)"
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                  />
                  {errorListaEspera && <p className="font-body text-xs text-red-400">{errorListaEspera}</p>}
                  <BotonPrimario
                    disabled={!nombre || !telefono || enviandoListaEspera}
                    onClick={apuntarseAListaEspera}
                  >
                    {enviandoListaEspera ? "Apuntando…" : "Notificarme cuando haya un espacio"}
                  </BotonPrimario>
                </div>
              ) : (
                <div className="space-y-2">
                  <BotonPrimario onClick={buscarProximoDisponible} disabled={buscandoProximo}>
                    {buscandoProximo ? "Buscando…" : "Próximos espacios"}
                  </BotonPrimario>
                  {errorProximo && <p className="font-body text-xs text-red-400">{errorProximo}</p>}
                  <button
                    onClick={() => setMostrarFormListaEspera(true)}
                    className="block font-body text-sm text-brand-yellow underline decoration-brand-yellow/40 underline-offset-4"
                  >
                    Lista de espera: avisadme cuando haya un hueco
                  </button>
                </div>
              )}
            </div>
          )}
          {fecha && horasUnicas.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {horasUnicas.map((slot) => {
                const hora = new Date(slot.hora_inicio).toLocaleTimeString("es-ES", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Europe/Madrid",
                });
                const elegido = slotElegido?.hora_inicio === slot.hora_inicio;
                return (
                  <button
                    key={slot.hora_inicio + slot.profesional_id}
                    onClick={() => setSlotElegido(slot)}
                    className={
                      "rounded-lg border px-2 py-2 font-mono text-sm transition-colors " +
                      (elegido
                        ? "border-brand-yellow bg-brand-yellow text-brand-yellow-ink"
                        : "border-brand-line text-brand-white hover:border-brand-yellow/60")
                    }
                  >
                    {hora}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <EnlaceVolver
              onClick={() =>
                setPaso(
                  servicioSeleccionado && esComplemento(servicioSeleccionado) ? "servicio" : "complementos"
                )
              }
            >
              ← Volver
            </EnlaceVolver>
            {slotElegido && <BotonPrimario onClick={() => setPaso("datos")}>Continuar</BotonPrimario>}
          </div>
        </div>
      )}

      {paso === "datos" && (
        <div className="space-y-4">
          <PasoTitulo>Tus datos</PasoTitulo>
          <div className="rounded-xl border border-brand-line bg-black/20 p-4 font-body text-sm text-brand-white-dim">
            <div className="font-heading text-base text-brand-white">{servicioSeleccionado?.nombre}</div>
            {complementosElegidos.map((c) => (
              <div key={c.id}>+ {c.nombre}</div>
            ))}
            <div className="mt-1 font-mono text-brand-yellow">
              Total:{" "}
              {pagarConSaldo && saldoCubreTotal ? (
                <span className="line-through opacity-60">{formatearPrecioServicio(precioTotalCentimos, totalEsVariable)}</span>
              ) : (
                formatearPrecioServicio(precioTotalCentimos, totalEsVariable)
              )}
              {pagarConSaldo && saldoCubreTotal && <span className="ml-1">0,00 € (con tu saldo)</span>}
            </div>
            {saldoDisponibleCentimos > 0 && (
              <label
                className={
                  "mt-3 flex items-start gap-2 border-t border-brand-line pt-3 " +
                  (saldoCubreTotal ? "text-brand-white" : "text-brand-white-dim opacity-60")
                }
              >
                <input
                  type="checkbox"
                  className="mt-1 accent-brand-yellow"
                  checked={pagarConSaldo && saldoCubreTotal}
                  disabled={!saldoCubreTotal}
                  onChange={(e) => setPagarConSaldo(e.target.checked)}
                />
                <span>
                  Pagar con mi saldo ({formatearPrecio(saldoDisponibleCentimos)} disponible)
                  {!saldoCubreTotal && " — todavía no te cubre el total de esta cita"}
                </span>
              </label>
            )}
          </div>
          <div className="space-y-3">
            <input
              className="w-full rounded-lg border border-brand-line bg-transparent p-3 font-body text-brand-white placeholder:text-brand-white-dim focus:border-brand-yellow focus:outline-none"
              placeholder="Nombre y apellidos"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
            <input
              className="w-full rounded-lg border border-brand-line bg-transparent p-3 font-body text-brand-white placeholder:text-brand-white-dim focus:border-brand-yellow focus:outline-none"
              placeholder="Teléfono (WhatsApp)"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
            />
            <input
              className="w-full rounded-lg border border-brand-line bg-transparent p-3 font-body text-brand-white placeholder:text-brand-white-dim focus:border-brand-yellow focus:outline-none"
              placeholder="Email (opcional)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <label className="flex items-start gap-2 font-body text-sm text-brand-white-dim">
            <input
              type="checkbox"
              className="mt-1 accent-brand-yellow"
              checked={aceptaComercial}
              onChange={(e) => setAceptaComercial(e.target.checked)}
            />
            <span>
              Quiero recibir ofertas y novedades de Barbería Grasso por WhatsApp, email o
              notificaciones. Podré darme de baja cuando quiera. (Opcional: no es necesario
              para reservar tu cita.)
            </span>
          </label>

          {error && <p className="font-body text-sm text-red-400">{error}</p>}

          <div className="flex items-center justify-between pt-1">
            <EnlaceVolver onClick={() => setPaso("fecha")}>← Cambiar hora</EnlaceVolver>
            <BotonPrimario disabled={!nombre || !telefono || enviando} onClick={confirmarReserva}>
              {enviando ? "Reservando…" : "Confirmar cita"}
            </BotonPrimario>
          </div>
        </div>
      )}

      {paso === "confirmado" && citaConfirmada && (
        <div className="space-y-3 rounded-2xl border border-brand-yellow/40 bg-brand-yellow/10 p-6 text-center">
          <GrassoMark className="mx-auto h-10 w-10 text-brand-yellow" />
          <p className="font-heading text-2xl italic text-brand-yellow">¡Cita confirmada!</p>
          <p className="font-body text-brand-white">
            {new Date(citaConfirmada.inicio).toLocaleString("es-ES", {
              dateStyle: "full",
              timeStyle: "short",
              timeZone: "Europe/Madrid",
            })}
          </p>
          <p className="font-body text-sm text-brand-white-dim">
            {sedeSeleccionada?.nombre} · {servicioSeleccionado?.nombre}
            {complementosElegidos.length > 0 &&
              ` + ${complementosElegidos.map((c) => c.nombre).join(", ")}`}{" "}
            · {citaConfirmada.profesionalNombre}
          </p>
          <p className="font-mono text-brand-white">Total: {formatearPrecioServicio(precioTotalCentimos, totalEsVariable)}</p>
          <p className="font-body text-xs text-brand-white-dim">Te avisaremos por WhatsApp antes de tu cita.</p>
        </div>
      )}
    </div>
  );
}
