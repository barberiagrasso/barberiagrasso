import PlantillasClient from "./PlantillasClient";

export const dynamic = "force-dynamic";

export default function PlantillasPage() {
  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-stone-900">Plantillas de WhatsApp</h1>
      <p className="mb-4 max-w-2xl text-sm text-stone-500">
        Los recordatorios y las campañas son mensajes que inicia el negocio, no una respuesta a
        algo que ha escrito el cliente en las últimas 24 horas. WhatsApp exige que esos mensajes
        usen una <strong>plantilla revisada y aprobada por Meta</strong> (texto libre no vale). Crea
        la plantilla en Meta Business Manager → WhatsApp Manager → Plantillas de mensajes, espera a
        que la aprueben (suele tardar de minutos a un par de días), y regístrala aquí con su nombre
        exacto para poder usarla.
      </p>
      <PlantillasClient />
    </div>
  );
}
