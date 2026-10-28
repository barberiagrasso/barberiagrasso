# GRASSO PERFORMANCE IA — Optimización de horarios

Análisis técnico (28/10/2026). Infraestructura: Vercel (web y API), Supabase
(datos), GitHub Actions (tareas programadas) y Claude (textos con IA).

## Qué hay hecho (fase 1, solo lectura)

- `lib/facturacionCita.ts`: el cálculo de lo que factura un barbero por cada
  cita, sacado de Comisiones sin cambiarlo. Comisiones y Rendimiento usan el
  mismo, así que nunca darán cifras distintas.
- `lib/rendimiento.ts` (+ tests): indicadores, mapa de ocupación, alertas y
  simulador. Funciones puras.
- `GET /api/admin/rendimiento?semanas=4..8`: solo el dueño. Lee de Supabase,
  no escribe nada.
- `/admin/rendimiento`: tabla del equipo, oportunidades, mapa de ocupación
  por sede y simulador de horarios.

No hay migraciones ni tablas nuevas: todo sale de los datos que ya existen.

## De dónde sale cada dato

| Indicador | Fuente |
|---|---|
| Facturación | `citas` completadas y sin recibo anulado + `cita_extras` + `bonos` (criterio de Comisiones) |
| Horas trabajadas = disponibles | `horarios` (turno) − descanso (`horarios.descanso_*` o `descansos_excepciones`) − `bloqueos` − `solicitudes_vacaciones` aprobadas |
| Horas con clientes | minutos de citas completadas dentro de las horas disponibles |
| Horas libres | disponibles − con clientes |
| Ocupación | con clientes / disponibles × 100 |
| Productividad | facturación / horas trabajadas |
| Ticket medio | facturación / citas |
| Clientes atendidos | clientes distintos |
| Ocupación por día y hora | rejilla 7 días × 24 h, por barbero y por sede |
| Huecos | minutos sueltos (< 30) entre dos citas seguidas |

Limitación: la app no tiene fichaje, así que "horas trabajadas" son las del
turno menos descansos y ausencias. Si algún día se ficha, se cambia solo esta
definición.

## Alertas (reglas fijas)

Franjas: mañana (hasta 14 h), primera hora de la tarde (14–17 h) y última hora
(desde 17 h). Solo cuentan franjas con al menos 2 h por semana.

- Poca demanda: ocupación del barbero < 35 % en una franja.
- Faltan barberos: ocupación de la sede ≥ 85 % en una franja.
- Sobran barberos: ocupación de la sede < 40 % con 2 o más barberos a la vez.
- Productividad baja: < 75 % de la mediana del equipo (con ≥ 10 h por semana).
- Huecos: más del 8 % de su tiempo en huecos sueltos.
- Objetivo: proyección mensual por debajo de 4.000 €.

## Simulador (supuestos)

A partir de la rejilla del barbero (media semanal de las semanas analizadas):

- Las horas que mantiene rinden igual que en su historial.
- Las horas que quita pierden su facturación, pero un % ajustable de esos
  clientes (60 % por defecto) se recoloca en sus horas libres, sin pasar del
  90 % de ocupación.
- Las horas nuevas se estiman con la ocupación de la sede a esa hora (otros
  barberos), con un máximo del 85 %, y con su facturación por hora ocupada.
- Mes = semana × 4,33.

Son estimaciones, no promesas. El simulador nunca guarda ni cambia horarios.

## Fases siguientes (pendientes de aprobación)

1. Informe del barbero: su propia vista (facturación, ocupación, €/h, mejores
   días, oportunidades y qué le falta para los 4.000 €), sin poder tocar su
   horario.
2. Grasso CEO IA: tarea diaria/semanal en GitHub Actions que calcula las
   alertas y pide a Claude un resumen para el dueño (por panel y WhatsApp).
   A Claude solo se le pasan cifras agregadas, nunca datos de clientes.
3. Propuestas de horario guardadas: tabla nueva en Supabase con estado
   pendiente/aprobada/rechazada. Al aprobar, el dueño aplica el cambio en
   Horarios a mano (o con un botón que pida confirmación). Requiere migración.
4. Foto diaria (tabla de indicadores por barbero, día y sede) para histórico
   y para que todo cargue más rápido con muchas sedes. Requiere migración.

Todo está pensado por sede: una sede nueva aparece sola al darla de alta.
