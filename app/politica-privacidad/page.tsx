import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Política de privacidad — Barbería Grasso",
};

export default function PoliticaPrivacidadPage() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl bg-brand-black px-4 py-16 font-body text-brand-white-dim">
      <Link
        href="/"
        className="font-body text-xs text-brand-white-dim underline decoration-brand-line underline-offset-4 hover:text-brand-yellow"
      >
        ← Volver
      </Link>
      <h1 className="mt-6 font-display text-2xl text-brand-white">Política de privacidad</h1>
      <p className="mt-2 text-sm text-brand-white-dim">Barbería Grasso — última actualización: octubre de 2026</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="font-heading text-base text-brand-white">Quiénes somos</h2>
          <p className="mt-2">
            Barbería Grasso, con sedes en Avenida de las Ciudades y Los Molinos (Getafe), es la responsable del
            tratamiento de los datos que se describen en esta página. Para cualquier consulta sobre tus
            datos puedes escribirnos por WhatsApp al número de contacto publicado en nuestra web y redes
            sociales, o preguntarnos directamente en la barbería.
          </p>
        </section>

        <section>
          <h2 className="font-heading text-base text-brand-white">Qué datos recogemos</h2>
          <p className="mt-2">Cuando reservas una cita, creas una cuenta, vienes a la barbería o nos escribes por WhatsApp, tratamos:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>tu nombre, tu número de teléfono y tu email, si lo facilitas;</li>
            <li>
              el historial de tus citas (servicio, profesional, sede, fecha y hora), los comentarios que
              dejes al reservar y las valoraciones que nos hagas después de tu visita;
            </li>
            <li>
              lo relacionado con el pago de tus visitas (importe, forma de pago y descuentos), tus bonos y
              el saldo de tu tarjeta de fidelización;
            </li>
            <li>
              el contenido de tus mensajes cuando nos escribes por WhatsApp o usas el buscador de citas de
              la app, incluidas las respuestas automáticas de nuestro asistente.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-heading text-base text-brand-white">Para qué los usamos y por qué podemos hacerlo</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              Gestionar tu cuenta y tus citas (confirmaciones, recordatorios, cambios, cancelaciones,
              cobros, bonos y fidelización) y responderte cuando nos escribes: es necesario para darte el
              servicio que nos pides.
            </li>
            <li>
              Guardar los datos de los cobros: lo exige la normativa fiscal y contable.
            </li>
            <li>
              Enviarte ofertas y novedades de la barbería: solo si nos das tu consentimiento marcando la
              casilla correspondiente. Puedes retirarlo cuando quieras, sin que afecte a tus citas.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-heading text-base text-brand-white">Cuánto tiempo los guardamos</h2>
          <p className="mt-2">
            Mientras tengas tu cuenta con nosotros. Si nos pides borrarla, eliminamos tus datos, salvo los
            que la ley nos obligue a conservar (por ejemplo, los de los cobros), que se guardan solo durante
            el plazo legal.
          </p>
        </section>

        <section>
          <h2 className="font-heading text-base text-brand-white">Con quién compartimos tus datos</h2>
          <p className="mt-2">
            No vendemos ni cedemos tus datos a terceros con fines publicitarios ajenos a Barbería Grasso.
            Sí utilizamos los siguientes proveedores, que tratan los datos en nuestro nombre y solo para
            prestar el servicio: Supabase (base de datos), Vercel (alojamiento de la web y la app), Meta /
            WhatsApp Business Platform (envío y recepción de mensajes de WhatsApp), Anthropic (el asistente
            automático que responde a los mensajes y al buscador de citas) y, en su caso, HubSpot (gestión
            de clientes). Algunos de ellos pueden tratar datos fuera del Espacio Económico Europeo; en ese
            caso lo hacen con las garantías que exige la normativa europea de protección de datos.
          </p>
        </section>

        <section>
          <h2 className="font-heading text-base text-brand-white">Tus derechos</h2>
          <p className="mt-2">
            Puedes pedirnos en cualquier momento acceder a tus datos, corregirlos o eliminarlos, oponerte a
            su uso o limitarlo, recibirlos en un formato que puedas llevarte, y retirar tu consentimiento
            para recibir comunicaciones comerciales, escribiéndonos por WhatsApp o pidiéndolo en la
            barbería. Si crees que no hemos tratado bien tus datos, también puedes reclamar ante la Agencia
            Española de Protección de Datos (www.aepd.es).
          </p>
        </section>
      </div>
    </main>
  );
}
