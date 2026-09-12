"use client";

import { useMemo, useState } from "react";
import type { Sede, Servicio, FranjaDisponible } from "@/lib/types";
import { GrassoMark } from "@/components/brand/GrassoMark";

type Paso = "sede" | "servicio" | "complementos" | "profesional" | "fecha" | "datos" | "confirmado";

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
}

interface Props {
  sedes: Sede[];
  servicios: Servicio[];
}

function formatearPrecio(centimos: number) {
  return (centimos / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

function proximosDias(cantidad: number) {
  const dias: { valor: string; etiqueta: string }[] = [];
  const hoy = new Date();
  for (let i = 0; i < cantidad; i++) {
    const d = new Date(hoy);
    d.setDate(hoy.getDate() + i);
    const valor = d.toISOString().slice(0, 10);
    const etiqueta = d.toLocaleDateString("es-ES", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    dias.push({ valor, etiqueta });
  }
  return dias;
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

function FilaServicio({ servicio, extra }: { servicio: Servicio; extra?: boolean }) {
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="font-heading text-lg">{servicio.nombre}</span>
        <span className={"font-mono text-base tabular-nums " + (extra ? "" : "text-brand-yellow")}>
          {extra ? "+" : ""}
          {formatearPrecio(servicio.precio_centimos)}
        </span>
      </div>
      <div className="mt-0.5 font-mono text-xs text-brand-white-dim opacity-80">
        {extra ? "+" : ""}
        {servicio.duracion_minutos} min
      </div>
      {servicio.descripcion && <div className="mt-1 font-body text-sm opacity-70">{servicio.descripcion}</div>}
    </>
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

export default function BookingFlow({ sedes, servicios }: Props) {
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
  const [slotElegido, setSlotElegido] = useState<FranjaDisponible | null>(null);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [aceptaComercial, setAceptaComercial] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [citaConfirmada, setCitaConfirmada] = useState<{ inicio: string; profesionalNombre: string } | null>(null);

  const dias = useMemo(() => proximosDias(14), []);
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

  async function elegirServicioYContinuar(id: string) {
    setServicioId(id);
    setComplementoIds([]);
    const servicio = servicios.find((s) => s.id === id);
    // Si el servicio elegido ya es un complemento (se reserva solo), no
    // tiene sentido ofrecer añadirle otro complemento encima.
    setPaso(servicio && esComplemento(servicio) ? "profesional" : "complementos");
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

  async function elegirFecha(valor: string) {
    setFecha(valor);
    setSlotElegido(null);
    setCargandoSlots(true);
    setSlots([]);
    const params = new URLSearchParams({
      sedeId: sedeId!,
      servicioId: servicioId!,
      fecha: valor,
    });
    if (profesionalId) params.set("profesionalId", profesionalId);
    if (duracionExtraMinutos > 0) params.set("duracionExtraMinutos", String(duracionExtraMinutos));
    const res = await fetch(`/api/disponibilidad?${params.toString()}`);
    const json = await res.json();
    setCargandoSlots(false);
    setSlots(json.slots ?? []);
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
      <ol className="mb-6 flex flex-wrap gap-2 font-mono text-[11px] uppercase tracking-wider text-brand-white-dim">
        {(
          [
            ["sede", "Sede"],
            ["servicio", "Servicio"],
            ["complementos", "Extras"],
            ["profesional", "Barbero"],
            ["fecha", "Fecha"],
            ["datos", "Datos"],
          ] as [Paso, string][]
        ).map(([clave, etiqueta]) => (
          <li
            key={clave}
            className={
              "rounded-full border px-3 py-1 " +
              (clave === paso
                ? "border-brand-yellow bg-brand-yellow text-brand-yellow-ink"
                : "border-brand-line text-brand-white-dim")
            }
          >
            {etiqueta}
          </li>
        ))}
      </ol>

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
              <TarjetaOpcion key={servicio.id} onClick={() => elegirServicioYContinuar(servicio.id)}>
                <FilaServicio servicio={servicio} />
              </TarjetaOpcion>
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
                            <TarjetaOpcion onClick={() => elegirServicioYContinuar(servicio.id)}>
                              <FilaServicio servicio={servicio} />
                            </TarjetaOpcion>
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
            {complementosDisponibles.map((c) => {
              const elegido = complementoIds.includes(c.id);
              return (
                <TarjetaOpcion key={c.id} seleccionado={elegido} onClick={() => alternarComplemento(c.id)}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-heading text-lg">
                      {elegido ? "✓ " : ""}
                      {c.nombre}
                    </span>
                    <span className="font-mono text-base tabular-nums">+{formatearPrecio(c.precio_centimos)}</span>
                  </div>
                  <div className="mt-0.5 font-mono text-xs opacity-70">+{c.duracion_minutos} min</div>
                </TarjetaOpcion>
              );
            })}
          </div>
          {complementosElegidos.length > 0 && (
            <p className="font-mono text-sm text-brand-yellow">
              Total con complementos: {formatearPrecio(precioTotalCentimos)} (
              {(servicioSeleccionado?.duracion_minutos ?? 0) + duracionExtraMinutos} min)
            </p>
          )}
          <div className="flex items-center justify-between pt-1">
            <EnlaceVolver onClick={() => setPaso("servicio")}>← Cambiar de servicio</EnlaceVolver>
            <BotonPrimario onClick={() => setPaso("profesional")}>
              {complementosElegidos.length > 0 ? "Continuar" : "Sin complementos"}
            </BotonPrimario>
          </div>
        </div>
      )}

      {paso === "profesional" && (
        <div className="space-y-3">
          <PasoTitulo>¿Con quién prefieres ir?</PasoTitulo>
          <TarjetaOpcion
            onClick={() => {
              setProfesionalId(null);
              setPaso("fecha");
            }}
          >
            <span className="font-body">Cualquier profesional disponible</span>
          </TarjetaOpcion>
          <div className="space-y-3">
            {profesionales.map((p) => (
              <TarjetaOpcion
                key={p.id}
                onClick={() => {
                  setProfesionalId(p.id);
                  setPaso("fecha");
                }}
              >
                <span className="font-heading text-lg">{p.nombre}</span>
              </TarjetaOpcion>
            ))}
          </div>
          <EnlaceVolver
            onClick={() =>
              setPaso(
                servicioSeleccionado && esComplemento(servicioSeleccionado) ? "servicio" : "complementos"
              )
            }
          >
            ← Volver
          </EnlaceVolver>
        </div>
      )}

      {paso === "fecha" && (
        <div className="space-y-4">
          <PasoTitulo>Elige día y hora</PasoTitulo>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {dias.map((d) => (
              <button
                key={d.valor}
                onClick={() => elegirFecha(d.valor)}
                className={
                  "shrink-0 rounded-full border px-3 py-2 font-mono text-xs capitalize transition-colors " +
                  (fecha === d.valor
                    ? "border-brand-yellow bg-brand-yellow text-brand-yellow-ink"
                    : "border-brand-line text-brand-white hover:border-brand-yellow/60")
                }
              >
                {d.etiqueta}
              </button>
            ))}
          </div>

          {fecha && cargandoSlots && <p className="font-body text-sm text-brand-white-dim">Buscando huecos…</p>}
          {fecha && !cargandoSlots && horasUnicas.length === 0 && (
            <p className="font-body text-sm text-brand-white-dim">No hay huecos ese día. Prueba con otra fecha.</p>
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
            <EnlaceVolver onClick={() => setPaso("profesional")}>← Cambiar profesional</EnlaceVolver>
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
            <div className="mt-1 font-mono text-brand-yellow">Total: {formatearPrecio(precioTotalCentimos)}</div>
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
          <p className="font-mono text-brand-white">Total: {formatearPrecio(precioTotalCentimos)}</p>
          <p className="font-body text-xs text-brand-white-dim">Te avisaremos por WhatsApp antes de tu cita.</p>
        </div>
      )}
    </div>
  );
}
