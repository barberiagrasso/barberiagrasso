import ConversacionesPanel from "./ConversacionesPanel";

/**
 * Página a pantalla completa de las conversaciones de WhatsApp. Ya no
 * está en el menú (ver AdminNav.tsx) — el acceso normal es la burbuja
 * flotante de WhatsAppFlotante.tsx, visible en todo el panel — pero esta
 * ruta se deja funcionando por si hay algún enlace directo guardado (por
 * ejemplo, en el aviso de conversaciones escaladas del propio panel).
 */
export default function ConversacionesPage() {
  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-stone-900">WhatsApp</h1>
      <ConversacionesPanel />
    </div>
  );
}
