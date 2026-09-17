"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { colorDeProfesional, fechasDelRango } from "@/lib/vacaciones";

interface Profesional {
  id: string;
  nombre: string;
}
type EstadoSolicitud = "pendiente" | "aprobada" | "rechazada";
interface Solicitud {
  id: string;
  profesional_id: string;
  fecha_inicio: string;
  fecha_fin: string;
  estado: EstadoSolicitud;
  motivo: string | null;
  solicitado_por: string | null;
  resuelto_en: string | null;
  profesional: { nombre: string } | { nombre: string }[] | null;
}
interface DiaBloqueado {
  id: string;
  fecha_inicio: string;
  fecha_fin: string;
  motivo: string | null;
}

function nombreDe(p: Solicitud["profesional"]): string {
  const prof = Array.isArray(p) ? p[0] : p;
  return prof?.nombre ?? "";
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function fechaISO(anio: number, mes: number, dia: number) {
  return `${anio}-${pad2(mes)}-${pad2(dia)}`;
}
function hoyLocalISO() {
  const hoy = new Date();
  return fechaISO(hoy.getFullYear(), hoy.getMonth() + 1, hoy.getDate());
}
function indiceMes(anio: number, mes: number) {
  return anio * 12 + (mes - 1);
}
// Rejilla en semanas de lunes a domingo, con null en los huecos antes del
// día 1 y después del último — mismo criterio que app/reservar/BookingFlow.tsx.
function celdasDelMes(anio: number, mes: number): (number | null)[] {
  const primerDia = new Date(anio, mes - 1, 1);
  const totalDias = new Date(anio, mes, 0).getDate();
  const offset = (primerDia.getDay() + 6) % 7;
  const celdas: (number | null)[] = Array(offset).fill(null);
  for (let d = 1; d <= totalDias; d++) celdas.push(d);
  while (celdas.length % 7 !== 0) celdas.push(null);
  return celdas;
}
function nombreMes(anio: number, mes: number) {
  const texto = new Date(anio, mes - 1, 1).toLocaleDateString("es-ES", { month: "long" });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

const ETIQUETA_ESTADO: Record<EstadoSolicitud, string> = { pendiente: "Pendiente", aprobada: "Aprobada", rechazada: "Rechazada" };

export default function VacacionesClient({
  rol,
  profesionalIdPropio,
  nombrePropio,
}: {
  rol: string;
  profesionalIdPropio: string | null;
  nombrePropio: string | null;
}) {
  const esAdmin = rol === "admin";
  const router = useRouter();
  const hoy = new Date();
  const [mesVisible, setMesVisible] = useState({ anio: hoy.getFullYear(), mes: hoy.getMonth() + 1 });
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [diasBloqueados, setDiasBloqueados] = useState<DiaBloqueado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState<Set<string> | null>(null); // null = todos visibles

  const [seleccion, setSeleccion] = useState<{ inicio: string; fin: string } | null>(null);
  const [motivo, setMotivo] = useState("");
  const [barberoElegido, setBarberoElegido] = useState(""); // solo admin, para dar de alta directamente
  const [aprobarDirectamente, setAprobarDirectamente] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [bloqueoInicio, setBloqueoInicio] = useState(hoyLocalISO());
  const [bloqueoFin, setBloqueoFin] = useState(hoyLocalISO());
  const [bloqueoMotivo, setBloqueoMotivo] = useState("");

  const ordenProfesionales = useMemo(() => profesionales.map((p) => p.id), [profesionales]);

  async function cargar() {
    setCargando(true);
    const primerDia = fechaISO(mesVisible.anio, mesVisible.mes, 1);
    const totalDias = new Date(mesVisible.anio, mesVisible.mes, 0).getDate();
    const ultimoDia = fechaISO(mesVisible.anio, mesVisible.mes, totalDias);
    const [resVac, resBloq] = await Promise.all([
      fetch(`/api/admin/vacaciones?desde=${primerDia}&hasta=${ultimoDia}`),
      fetch(`/api/admin/vacaciones/dias-bloqueados`),
    ]);
    const jsonVac = await resVac.json();
    const jsonBloq = await resBloq.json();
    setSolicitudes(jsonVac.solicitudes ?? []);
    setProfesionales(jsonVac.profesionales ?? []);
    setDiasBloqueados(jsonBloq.dias ?? []);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesVisible.anio, mesVisible.mes]);

  // Índice fecha -> lo que hay marcado ese día, ya resuelto en memoria
  // (fechasDelRango expande cada solicitud/bloqueo a sus días sueltos).
  const porFecha = useMemo(() => {
    const mapa = new Map<string, { solicitud: Solicitud }[]>();
    for (const s of solicitudes) {
      for (const f of fechasDelRango({ inicio: s.fecha_inicio, fin: s.fecha_fin })) {
        if (!mapa.has(f)) mapa.set(f, []);
        mapa.get(f)!.push({ solicitud: s });
      }
    }
    return mapa;
  }, [solicitudes]);

  const fechasBloqueadas = useMemo(() => {
    const set = new Set<string>();
    for (const b of diasBloqueados) {
      for (const f of fechasDelRango({ inicio: b.fecha_inicio, fin: b.fecha_fin })) set.add(f);
    }
    return set;
  }, [diasBloqueados]);

  const pendientes = solicitudes.filter((s) => s.estado === "pendiente").sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio));
  const misSolicitudes = solicitudes
    .filter((s) => s.profesional_id === profesionalIdPropio)
    .sort((a, b) => b.fecha_inicio.localeCompare(a.fecha_inicio));

  function cambiarMes(delta: number) {
    setMesVisible((v) => {
      const idx = indiceMes(v.anio, v.mes) + delta;
      return { anio: Math.floor(idx / 12), mes: (idx % 12) + 1 };
    });
  }

  // Un clic elige un solo día (de inicio y de fin, ambos ese día); el
  // rango se afina con los dos campos de fecha del panel de abajo, igual
  // que en "Bloquear fechas" — más claro y fiable que intentar adivinar
  // si un segundo clic amplía el rango o empieza uno nuevo.
  function clicarDia(fecha: string) {
    if (!esAdmin && fechasBloqueadas.has(fecha)) return; // un barbero no puede ni empezar a seleccionar ahí
    setSeleccion({ inicio: fecha, fin: fecha });
    setError(null);
  }

  function cambiarInicioSeleccion(inicio: string) {
    setSeleccion((s) => (s ? { inicio, fin: s.fin < inicio ? inicio : s.fin } : { inicio, fin: inicio }));
  }
  function cambiarFinSeleccion(fin: string) {
    setSeleccion((s) => (s ? { inicio: s.inicio > fin ? fin : s.inicio, fin } : { inicio: fin, fin }));
  }

  async function enviarSolicitud() {
    if (!seleccion) return;
    setEnviando(true);
    setError(null);
    const res = await fetch("/api/admin/vacaciones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fechaInicio: seleccion.inicio,
        fechaFin: seleccion.fin,
        motivo: motivo || null,
        profesionalId: esAdmin ? barberoElegido || null : undefined,
        aprobarDirectamente: esAdmin ? aprobarDirectamente : undefined,
      }),
    });
    const json = await res.json();
    setEnviando(false);
    if (!res.ok) {
      setError(json.error || "No se pudo enviar la solicitud.");
      return;
    }
    setSeleccion(null);
    setMotivo("");
    setBarberoElegido("");
    setAprobarDirectamente(false);
    cargar();
    router.refresh(); // por si esto cambia el aviso de pendientes del admin (alta directa ya aprobada no lo toca, pero no está de más)
  }

  async function resolver(id: string, estado: "aprobada" | "rechazada") {
    setError(null);
    const res = await fetch(`/api/admin/vacaciones/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "No se pudo actualizar.");
      return;
    }
    cargar();
    // El aviso ámbar de "solicitudes pendientes" vive en el layout (un
    // Server Component) — sin esto se queda con el número antiguo hasta
    // que se navegue a otra pantalla, aunque aquí ya no quede ninguna.
    router.refresh();
  }

  async function retirar(id: string) {
    if (!confirm("¿Retirar esta solicitud?")) return;
    await fetch(`/api/admin/vacaciones/${id}`, { method: "DELETE" });
    cargar();
    router.refresh();
  }

  async function crearBloqueo() {
    setError(null);
    const res = await fetch("/api/admin/vacaciones/dias-bloqueados", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fechaInicio: bloqueoInicio, fechaFin: bloqueoFin, motivo: bloqueoMotivo || null }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "No se pudo bloquear ese periodo.");
      return;
    }
    setBloqueoMotivo("");
    cargar();
  }

  async function quitarBloqueo(id: string) {
    await fetch(`/api/admin/vacaciones/dias-bloqueados/${id}`, { method: "DELETE" });
    cargar();
  }

  function alternarFiltro(id: string) {
    setFiltro((actual) => {
      const base = actual ?? new Set(profesionales.map((p) => p.id));
      const nuevo = new Set(base);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
  }
  const visibleEnFiltro = (id: string) => !filtro || filtro.has(id);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        {esAdmin && profesionales.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {profesionales.map((p) => {
              const color = colorDeProfesional(p.id, ordenProfesionales);
              const visible = visibleEnFiltro(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => alternarFiltro(p.id)}
                  className={
                    "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition " +
                    (visible ? "border-stone-300 bg-white text-stone-700" : "border-stone-200 bg-stone-100 text-stone-400")
                  }
                >
                  <span className={"h-2 w-2 rounded-full " + (visible ? color.bg : "bg-stone-300")} />
                  {p.nombre}
                </button>
              );
            })}
          </div>
        )}

        <div className="mb-3 flex items-center justify-between">
          <button
            onClick={() => cambiarMes(-1)}
            className="rounded-lg border border-stone-300 px-2 py-1 text-sm font-semibold text-stone-900 hover:border-stone-400"
          >
            ←
          </button>
          <span className="font-medium text-stone-800">
            {nombreMes(mesVisible.anio, mesVisible.mes)} {mesVisible.anio}
          </span>
          <button
            onClick={() => cambiarMes(1)}
            className="rounded-lg border border-stone-300 px-2 py-1 text-sm font-semibold text-stone-900 hover:border-stone-400"
          >
            →
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[11px] uppercase tracking-wide text-stone-400">
          {["L", "M", "X", "J", "V", "S", "D"].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {celdasDelMes(mesVisible.anio, mesVisible.mes).map((dia, i) => {
            if (!dia) return <div key={i} />;
            const fecha = fechaISO(mesVisible.anio, mesVisible.mes, dia);
            const marcas = (porFecha.get(fecha) ?? []).filter((m) => esAdmin && visibleEnFiltro(m.solicitud.profesional_id) ? true : !esAdmin);
            const bloqueado = fechasBloqueadas.has(fecha);
            const enSeleccion = seleccion && fecha >= seleccion.inicio && fecha <= seleccion.fin;
            const propiaAqui = marcas.find((m) => m.solicitud.profesional_id === profesionalIdPropio);
            const deOtro = !esAdmin && marcas.some((m) => m.solicitud.profesional_id !== profesionalIdPropio);

            return (
              <button
                key={fecha}
                onClick={() => clicarDia(fecha)}
                disabled={!esAdmin && bloqueado}
                className={
                  "flex min-h-[54px] flex-col items-start gap-0.5 rounded-lg border p-1 text-left text-[11px] transition " +
                  (enSeleccion
                    ? "border-brand-yellow bg-brand-yellow/20"
                    : bloqueado
                      ? "border-stone-200 bg-stone-100"
                      : "border-stone-200 bg-white hover:border-stone-300") +
                  (!esAdmin && bloqueado ? " cursor-not-allowed opacity-60" : " cursor-pointer")
                }
              >
                <span className="font-medium text-stone-600">{dia}</span>
                {bloqueado && <span className="text-[10px] text-stone-400">Bloqueado</span>}
                {esAdmin &&
                  marcas.slice(0, 3).map((m, idx) => {
                    const color = colorDeProfesional(m.solicitud.profesional_id, ordenProfesionales);
                    return (
                      <span
                        key={idx}
                        title={`${nombreDe(m.solicitud.profesional)} — ${ETIQUETA_ESTADO[m.solicitud.estado]}`}
                        className={
                          "w-full truncate rounded px-1 text-[10px] " +
                          (m.solicitud.estado === "pendiente" ? "border " + color.claro : "text-white " + color.bg)
                        }
                      >
                        {nombreDe(m.solicitud.profesional)}
                      </span>
                    );
                  })}
                {!esAdmin && propiaAqui && (
                  <span
                    className={
                      "w-full truncate rounded px-1 text-[10px] " +
                      (propiaAqui.solicitud.estado === "pendiente"
                        ? "border border-amber-300 bg-amber-100 text-amber-800"
                        : propiaAqui.solicitud.estado === "aprobada"
                          ? "bg-emerald-500 text-white"
                          : "bg-stone-300 text-stone-600 line-through")
                    }
                  >
                    {ETIQUETA_ESTADO[propiaAqui.solicitud.estado]}
                  </span>
                )}
                {!esAdmin && !propiaAqui && deOtro && <span className="w-full truncate rounded bg-stone-200 px-1 text-[10px] text-stone-500">Ocupado</span>}
              </button>
            );
          })}
        </div>
        {cargando && <p className="mt-2 text-xs text-stone-400">Cargando…</p>}

        {seleccion && (
          <div className="mt-4 space-y-2 rounded-lg border border-brand-yellow bg-brand-yellow/10 p-3 text-sm">
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={seleccion.inicio}
                onChange={(e) => cambiarInicioSeleccion(e.target.value)}
                className="w-full rounded-lg border border-stone-300 p-1.5 text-sm"
              />
              <span className="text-stone-400">a</span>
              <input
                type="date"
                value={seleccion.fin}
                onChange={(e) => cambiarFinSeleccion(e.target.value)}
                className="w-full rounded-lg border border-stone-300 p-1.5 text-sm"
              />
            </div>
            {esAdmin && (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={barberoElegido}
                  onChange={(e) => setBarberoElegido(e.target.value)}
                  className="rounded-lg border border-stone-300 p-1.5 text-sm"
                >
                  <option value="">Elige un barbero…</option>
                  {profesionales.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1.5 text-xs text-stone-600">
                  <input type="checkbox" checked={aprobarDirectamente} onChange={(e) => setAprobarDirectamente(e.target.checked)} />
                  Dar de alta ya aprobada
                </label>
              </div>
            )}
            <input
              placeholder="Motivo (opcional)"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="w-full rounded-lg border border-stone-300 p-1.5 text-sm"
            />
            <div className="flex gap-2">
              <button
                disabled={enviando || (esAdmin && !barberoElegido)}
                onClick={enviarSolicitud}
                className="rounded-lg bg-brand-yellow px-3 py-1.5 text-sm font-medium text-brand-yellow-ink disabled:opacity-50"
              >
                {enviando ? "Enviando…" : esAdmin ? "Guardar vacaciones" : "Solicitar estos días"}
              </button>
              <button onClick={() => setSeleccion(null)} className="text-sm text-stone-500 underline">
                Cancelar
              </button>
            </div>
          </div>
        )}
        {!seleccion && (
          <p className="mt-3 text-xs text-stone-400">
            Toca un día del calendario para empezar; luego puedes ajustar la fecha de inicio y la de fin a mano en el
            panel (pueden ser el mismo día). {esAdmin ? "" : "No puedes pedir días ya bloqueados ni ya ocupados por otro barbero."}
          </p>
        )}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      <div className="space-y-6">
        {esAdmin && (
          <div>
            <h2 className="mb-2 text-sm font-semibold text-stone-800">
              Solicitudes pendientes {pendientes.length > 0 && `(${pendientes.length})`}
            </h2>
            <div className="space-y-2">
              {pendientes.length === 0 && <p className="text-sm text-stone-400">No hay ninguna pendiente.</p>}
              {pendientes.map((s) => (
                <div key={s.id} className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-sm">
                  <p className="font-medium text-stone-900">{nombreDe(s.profesional)}</p>
                  <p className="text-xs text-stone-500">
                    {s.fecha_inicio === s.fecha_fin ? s.fecha_inicio : `${s.fecha_inicio} — ${s.fecha_fin}`}
                    {s.motivo ? ` · ${s.motivo}` : ""}
                  </p>
                  <div className="mt-1.5 flex gap-3">
                    <button onClick={() => resolver(s.id, "aprobada")} className="text-xs font-medium text-emerald-700 underline">
                      Aprobar
                    </button>
                    <button onClick={() => resolver(s.id, "rechazada")} className="text-xs font-medium text-red-700 underline">
                      Rechazar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!esAdmin && (
          <div>
            <h2 className="mb-2 text-sm font-semibold text-stone-800">Mis solicitudes</h2>
            <div className="space-y-2">
              {misSolicitudes.length === 0 && <p className="text-sm text-stone-400">Aún no has pedido ninguna.</p>}
              {misSolicitudes.map((s) => (
                <div key={s.id} className="rounded-lg border border-stone-200 bg-white p-2.5 text-sm">
                  <p className="text-xs text-stone-500">
                    {s.fecha_inicio === s.fecha_fin ? s.fecha_inicio : `${s.fecha_inicio} — ${s.fecha_fin}`}
                    {s.motivo ? ` · ${s.motivo}` : ""}
                  </p>
                  <div className="mt-1 flex items-center justify-between">
                    <span
                      className={
                        "rounded-full px-2 py-0.5 text-xs " +
                        (s.estado === "aprobada"
                          ? "bg-emerald-100 text-emerald-700"
                          : s.estado === "rechazada"
                            ? "bg-red-100 text-red-700"
                            : "bg-amber-100 text-amber-700")
                      }
                    >
                      {ETIQUETA_ESTADO[s.estado]}
                    </span>
                    {s.estado === "pendiente" && (
                      <button onClick={() => retirar(s.id)} className="text-xs text-stone-500 underline">
                        Retirar
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {esAdmin && (
          <div>
            <h2 className="mb-2 text-sm font-semibold text-stone-800">Bloquear fechas para pedir vacaciones</h2>
            <div className="space-y-2 rounded-lg border border-stone-200 bg-white p-3 text-sm">
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={bloqueoInicio}
                  onChange={(e) => setBloqueoInicio(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 p-1.5 text-sm"
                />
                <span className="text-stone-400">a</span>
                <input
                  type="date"
                  value={bloqueoFin}
                  onChange={(e) => setBloqueoFin(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 p-1.5 text-sm"
                />
              </div>
              <input
                placeholder="Motivo (opcional): Navidad, evento…"
                value={bloqueoMotivo}
                onChange={(e) => setBloqueoMotivo(e.target.value)}
                className="w-full rounded-lg border border-stone-300 p-1.5 text-sm"
              />
              <button onClick={crearBloqueo} className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white">
                Bloquear
              </button>
            </div>
            {diasBloqueados.length > 0 && (
              <div className="mt-2 space-y-1">
                {diasBloqueados.map((b) => (
                  <div key={b.id} className="flex items-center justify-between rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs">
                    <span>
                      {b.fecha_inicio === b.fecha_fin ? b.fecha_inicio : `${b.fecha_inicio} — ${b.fecha_fin}`}
                      {b.motivo ? ` · ${b.motivo}` : ""}
                    </span>
                    <button onClick={() => quitarBloqueo(b.id)} className="text-red-700 underline">
                      Quitar
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-2 text-xs text-stone-400">
              ¿Necesitas cerrar toda una sede un día concreto (festivo)? Eso se hace desde{" "}
              <a href="/admin/bloqueos" className="underline">
                Bloqueos de sede
              </a>
              .
            </p>
          </div>
        )}

        {!esAdmin && (
          <p className="text-xs text-stone-400">
            {nombrePropio ? `Hola, ${nombrePropio.split(" ")[0]}. ` : ""}Tus solicitudes quedan pendientes hasta que{" "}
            {esAdmin ? "" : "el admin"} las apruebe — te avisará si hace falta algún cambio.
          </p>
        )}
      </div>
    </div>
  );
}
