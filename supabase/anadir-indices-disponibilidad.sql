-- Índices que faltaban en bloqueos y horarios para acelerar el cálculo
-- de disponibilidad (getAvailableSlots / getMonthAvailabilitySummary en
-- lib/availability.ts), que filtra ambas tablas exactamente por estas
-- columnas en cada consulta. Ambas tablas solo tenían el índice de
-- clave primaria hasta ahora.
create index if not exists bloqueos_sede_fechas_idx
  on bloqueos (sede_id, fecha_inicio, fecha_fin);

create index if not exists horarios_sede_dia_idx
  on horarios (sede_id, dia_semana);
