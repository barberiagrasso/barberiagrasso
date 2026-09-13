import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de privacidad — Barbería Grasso",
};

export default function PoliticaPrivacidadPage() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl bg-brand-black px-4 py-16 font-body text-brand-white-dim">
      <h1 className="font-display text-2xl text-brand-white">Política de privacidad</h1>
      <p className="mt-2 text-sm text-brand-white-dim">Barbería Grasso — última actualización: septiembre de 2026</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="font-heading text-base text-brand-white">Quiénes somos</h2>
          <p className="mt-2">
            Barbería Grasso, con sedes en Avenida de las Ciudades y Los Molinos, es la responsable del
            tratamiento de los datos que se describen en esta página. Para cualquier consulta sobre tus
            datos puedes escribirnos por WhatsApp al número de contacto publicado en nuestra web y redes
            sociales.
          </p>
        </section>

        <section>
          <h2 className="font-heading text-base text-brand-white">Qué datos recogemos</h2>
          <p className="mt-2">Cuando reservas una cita, creas una cuenta o nos escribes por WhatsApp, tratamos:</p>
          <p className="mt-2">
            tu nombre; tu número de teléfono; tu email, si lo facilitas; el historial de tus citas
            (servicio, profesional, sede, fecha y hora); y el contenido de tus mensajes cuando nos
            escribes por WhatsApp, incluidas las respuestas automáticas de nuestro asistente.
          </p>
        </section>

        <section>
          <h2 className="font-heading text-base text-brand-white">Para qué los usamos</h2>
          <p className="mt-2">
            Usamos estos datos para gestionar tus citas (confirmaciones, recordatorios, cambios y
            cancelaciones), para responderte por WhatsApp cuando nos escribes, y, si nos has dado tu
            consentimiento expreso al registrarte, para enviarte comunicaciones comerciales sobre
            promociones o novedades de la barbería.
          </p>
        </section>

        <section>
          <h2 className="font-heading text-base text-brand-white">Con quién compartimos tus datos</h2>
          <p className="mt-2">
            No vendemos ni cedemos tus datos a terceros con fines publicitarios ajenos a Barbería Grasso.
            Sí utilizamos los siguientes proveedores, que tratan los datos en nuestro nombre para prestar
            el servicio: Supabase (alojamiento de la base de datos), Meta / WhatsApp Business Platform
            (envío y recepción de mensajes de WhatsApp) y HubSpot (gestión comercial de clientes, como
            CRM).
          </p>
        </section>

        <section>
          <h2 className="font-heading text-base text-brand-white">Tus derechos</h2>
          <p className="mt-2">
            Puedes pedirnos en cualquier momento acceder a tus datos, corregirlos o eliminarlos, así como
            retirar tu consentimiento para recibir comunicaciones comerciales, escribiéndonos por
            WhatsApp o email.
          </p>
        </section>
      </div>
    </main>
  );
}
