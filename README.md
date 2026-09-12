# Barbería Grasso — Sistema propio de reservas, CRM y WhatsApp con IA

Este proyecto es el punto de partida real (no una maqueta) del ecosistema descrito en el
documento de especificación técnica: una app de reserva para clientes, un panel de control
con CRM para ti, y un asistente de WhatsApp con IA. Está pensado para que lo despliegues y
mantengas tú mismo, con la ayuda de Claude, sin depender de una agencia.

**No necesitas saber programar para desplegarlo**: sigue los pasos en orden, copiando y
pegando los comandos y valores exactamente. Cuando llegues a un punto en el que quieras
cambiar algo (un texto, un color, una regla de negocio), pídeselo a Claude describiéndolo
en español — dile en qué archivo de este proyecto quieres que mire si ya lo sabes, o
simplemente describe qué quieres conseguir.

## Qué incluye ya este proyecto (funcionando de verdad)

- **Base de datos completa** (`supabase/schema.sql`) para las dos sedes: servicios, horarios,
  profesionales, clientes, citas (con sus complementos como filas propias en `cita_extras`),
  consentimientos, conversaciones de WhatsApp, campañas y plantillas de WhatsApp.
- **Página de reserva** (`/reservar`): el cliente elige sede, uno de los 4 servicios
  principales o uno de los desplegables, complementos opcionales, profesional (opcional),
  fecha y hora real disponible, y confirma con sus datos. Funciona perfectamente desde el
  móvil (es una web responsive) aunque todavía no está empaquetada como app de App
  Store/Google Play — ver "Qué falta" más abajo.
- **Panel de control** (`/admin`), con gestión visual completa (sin tocar Supabase):
  - **Agenda**: creación, cancelación y cambios de estado de citas por sede.
  - **Servicios**: catálogo, precios, duración y en qué desplegable aparece cada uno.
  - **Equipo**: alta de barberos, a qué sedes y servicios están asignados, y su horario
    semanal.
  - **Vacaciones**: bloqueos puntuales por barbero o por sede.
  - **Clientes (CRM)**: listado con su estado de consentimiento comercial.
  - **Campañas**: segmentar clientes (por sede, etiqueta, o quién no viene desde hace
    tiempo) y mandarles un mensaje de WhatsApp — solo a quien haya dado su consentimiento.
  - **Plantillas**: registro de las plantillas de WhatsApp que Meta te apruebe, para
    recordatorios y campañas.
  - **Informes**: ingresos por sede y por barbero, servicios y complementos más pedidos, y
    ocupación aproximada por franja horaria.
  - **WhatsApp**: supervisión de conversaciones, con posibilidad de responder tú
    manualmente en cualquier momento.
- **Asistente de WhatsApp con IA** (usando la API de Claude): responde dudas de servicios,
  precios y horarios, consulta disponibilidad real, ofrece complementos y crea la cita
  directamente en la conversación; también puede **cancelar o reprogramar** una cita ya
  existente si faltan 60 minutos o más (si falta menos, le dice al cliente que llame a la
  barbería), o escala a una persona cuando no puede resolver algo.
- **Recordatorios automáticos**: un disparador programado (ver más abajo) revisa cada hora
  las citas que empiezan pronto y manda un recordatorio por WhatsApp, sin mandarlo dos veces.
- **Motor de disponibilidad** que evita dobles reservas entre la app, el panel y WhatsApp,
  porque los tres comparten la misma base de datos (tal y como recomendaba la sección 5 del
  documento de especificación).
- **Cumplimiento del consentimiento comercial**: casilla explícita y no premarcada, registro
  de fecha/canal/texto aceptado, el CRM solo permite ver quién ha dado ese consentimiento, y
  las campañas nunca incluyen a quien no lo haya dado (ver `supabase/schema.sql`, tablas
  `consentimientos`).

### Recordatorios y campañas: hace falta WhatsApp Business + una plantilla aprobada

Los recordatorios y las campañas son mensajes que **inicia el negocio**, no una respuesta a
algo que ha escrito el cliente en las últimas 24 horas. WhatsApp exige que ese tipo de mensaje
use una **plantilla revisada y aprobada por Meta** (texto libre no vale). Para que funcionen
de verdad, hacen falta tres cosas, en este orden:

1. Completa el **Paso 4** de este README (conectar WhatsApp Business Platform), si no lo has
   hecho ya.
2. En Meta Business Manager → WhatsApp Manager → Plantillas de mensajes, crea al menos una
   plantilla de tipo "Marketing" o "Utility" con las variables que quieras (por ejemplo:
   `Hola {{1}}, te recordamos tu cita de {{2}} hoy a las {{3}}.`) y espera a que Meta la
   apruebe (de minutos a un par de días).
3. Ve a `/admin/plantillas` en tu panel y regístrala: nombre exacto tal cual la creaste en
   Meta, y el nombre de cada variable en el mismo orden (para recordatorios puedes usar
   `nombre`, `servicio`, `hora`, `sede`, `fecha`; para campañas, `nombre` y `mensaje`).

Mientras no completes esto, las campañas se pueden seguir creando como borrador y los
recordatorios simplemente no se mandan (no da ningún error).

### Recordatorios: por qué hace falta GitHub Actions

Vercel, en su plan gratuito (Hobby), solo permite que los cron jobs propios de un proyecto se
ejecuten **una vez al día** — y los recordatorios necesitan revisarse con más frecuencia para
poder mandarse unas horas antes de cada cita. Por eso se usa GitHub Actions (gratis) como
disparador externo: el archivo `.github/workflows/recordatorios.yml` llama, una vez por hora,
al endpoint `/api/cron/recordatorios` de tu propia app.

Para activarlo:

1. En Vercel, añade estas dos variables de entorno nuevas (junto a las demás): `CRON_SECRET`
   (una frase secreta larga que te inventes) y opcionalmente `RECORDATORIO_HORAS_ANTES` (por
   defecto 3).
2. En GitHub, ve a tu repositorio → **Settings → Secrets and variables → Actions → New
   repository secret**, y crea dos secretos: `CRON_SECRET` (el mismo valor exacto que
   pusiste en Vercel) y `APP_URL` (la URL pública de tu app, sin barra al final).
3. Sube este cambio con `git push`: en cuanto GitHub detecte el archivo
   `.github/workflows/recordatorios.yml`, empezará a ejecutarlo solo, cada hora. Puedes
   probarlo a mano desde GitHub → pestaña **Actions** → "Recordatorios de citas" → **Run
   workflow**.

(Si en el futuro prefieres más precisión y no te importa pagar, la alternativa es subir tu
proyecto a Vercel Pro, que sí permite cron jobs cada minuto — pídeselo a Claude si cambias de
opinión más adelante.)

## Qué falta todavía (siguientes iteraciones, pídeselo a Claude cuando quieras)

- **Empaquetar como app nativa** en App Store / Google Play: la reserva ya funciona como una
  web para móvil; convertirla en una app instalable con Capacitor (o similar) es un paso
  posterior, una vez valides que el sistema funciona bien en el día a día.
- **Pagos y señales anticipadas** (por ejemplo con Stripe) para reducir las citas fantasma.
- **Fidelización por puntos o visitas** (ej. cada 10 cortes, uno gratis).
- Cualquier otra idea nueva que se te ocurra — este proyecto sigue evolucionando contigo.

---

## Paso 1 — Crear el proyecto en Supabase (base de datos + autenticación)

1. Ve a [supabase.com](https://supabase.com) y crea una cuenta gratuita.
2. Crea un nuevo proyecto (elige una región de Europa, por ejemplo Frankfurt, para que vaya
   rápido desde España). Guarda la contraseña de base de datos que te pida.
3. Cuando el proyecto esté listo, ve a **SQL Editor** (en el menú lateral) → **New query**.
4. Abre el archivo `supabase/schema.sql` de este proyecto, copia todo su contenido, pégalo
   en el editor de Supabase y pulsa **Run**. Esto crea todas las tablas y las reglas de
   seguridad.
5. (Opcional pero recomendado para empezar a ver la app funcionando ya) Repite el paso 4
   con el archivo `supabase/seed.sql`: crea las dos sedes, unos servicios y horarios de
   ejemplo que luego edites con los datos reales.
6. Ve a **Project Settings → API**. Ahí verás:
   - `Project URL` → es tu `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → es tu `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key (dale a "Reveal") → es tu `SUPABASE_SERVICE_ROLE_KEY`. **Trátala
     como una contraseña maestra: nunca la compartas ni la pongas en el código del
     navegador.**

### Crea tu usuario administrador

1. En Supabase, ve a **Authentication → Users → Add user** (o "Invite"). Crea tu usuario con
   tu email y una contraseña.
2. Copia el `UID` (identificador) de ese usuario que aparece en la lista.
3. Ve a **SQL Editor** de nuevo y ejecuta (sustituyendo el UID y tu nombre):

   ```sql
   insert into admins (id, nombre) values ('PEGA-AQUÍ-EL-UID', 'Diego');
   ```

4. Con esto, ese usuario ya puede entrar en `/admin/login` con permisos completos.

### Editar servicios, profesionales y horarios reales

Esto ya no hace falta hacerlo en Supabase: desde el panel, en `/admin/servicios` y
`/admin/profesionales`, puedes crear y editar servicios, precios, barberos, a qué sedes y
servicios están asignados, y su horario semanal. Las direcciones de las sedes se editan
directamente en Table Editor → tabla `sedes` (columnas `direccion` y `maps_url`), ya que no
cambian casi nunca.

---

## Paso 2 — Subir el proyecto a GitHub

Vercel (donde vas a alojar la app) se conecta a un repositorio de GitHub. Si no tienes
cuenta, créala gratis en [github.com](https://github.com).

Desde una terminal, dentro de la carpeta de este proyecto:

```bash
git init
git add .
git commit -m "Primera versión del sistema de Barbería Grasso"
```

Luego crea un repositorio nuevo (vacío) en GitHub y sigue las instrucciones que te da
GitHub mismo para "…or push an existing repository from the command line" (son 2-3
comandos `git remote add` y `git push` que te copia y pega GitHub).

## Paso 3 — Desplegar en Vercel

1. Ve a [vercel.com](https://vercel.com) y crea una cuenta con tu GitHub (así se conectan
   automáticamente).
2. **Add New → Project**, elige el repositorio que acabas de subir.
3. En **Environment Variables**, añade estas (los valores los sacaste en el Paso 1; los de
   WhatsApp y Anthropic los sacarás en los pasos 4 y 5 — puedes desplegar sin ellos y
   añadirlos después):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ANTHROPIC_API_KEY`
   - `WHATSAPP_TOKEN`
   - `WHATSAPP_PHONE_NUMBER_ID`
   - `WHATSAPP_VERIFY_TOKEN` (invéntate una frase secreta larga, la usarás también en el
     Paso 4)
   - `BUSINESS_TIMEZONE` = `Europe/Madrid`
4. Pulsa **Deploy**. En un par de minutos tendrás una URL pública, algo como
   `https://barberia-grasso.vercel.app`.
5. Prueba `https://tu-url.vercel.app/reservar` y `https://tu-url.vercel.app/admin/login`.

Cada vez que quieras publicar un cambio (tuyo o hecho con Claude), basta con hacer
`git add . && git commit -m "..." && git push`: Vercel despliega automáticamente la nueva
versión.

## Paso 4 — Conectar WhatsApp Business Platform

1. Ve a [developers.facebook.com](https://developers.facebook.com) y crea una cuenta de
   desarrollador si no la tienes, y una nueva App de tipo "Business".
2. Añade el producto **WhatsApp** a esa app. Meta te da automáticamente un número de
   prueba para empezar a probar gratis (más adelante añades tu número real de negocio).
3. En **WhatsApp → API Setup** copia:
   - El **Temporary access token** (para producción real, genera un token permanente desde
     **System Users** — Claude puede guiarte con esto cuando llegues a ese punto) → pégalo
     en Vercel como `WHATSAPP_TOKEN`.
   - El **Phone number ID** → pégalo como `WHATSAPP_PHONE_NUMBER_ID`.
4. En **WhatsApp → Configuration → Webhook**, pulsa "Edit" y pon:
   - **Callback URL**: `https://tu-url.vercel.app/api/whatsapp/webhook`
   - **Verify token**: la misma frase secreta que pusiste en `WHATSAPP_VERIFY_TOKEN`
   - Guarda, y suscríbete al campo (field) **messages**.
5. Vuelve a Vercel, actualiza las variables de entorno con los valores reales y haz un
   "Redeploy" para que se apliquen.
6. Escribe por WhatsApp al número de prueba desde tu móvil: el asistente con IA debería
   responderte.

## Paso 5 — Crear tu clave de la API de Claude (Anthropic)

1. Ve a [console.anthropic.com](https://console.anthropic.com), crea una cuenta y añade un
   método de pago (la API se cobra por uso, no por suscripción; para el volumen de una
   barbería el coste mensual suele ser bajo, pero consúltalo tú directamente en la consola).
2. Ve a **API Keys → Create key**, y pega esa clave en Vercel como `ANTHROPIC_API_KEY`.

## Paso 6 — Probar todo de principio a fin

- [ ] Reserva una cita de prueba desde `/reservar` con tu propio teléfono, añadiendo algún
      complemento en el paso extra.
- [ ] Comprueba que aparece en `/admin/dashboard` en la sede y hora correctas.
- [ ] Cancélala y créala de nuevo desde el propio panel (simulando una llamada de
      teléfono).
- [ ] Escribe por WhatsApp al número conectado preguntando precios y horarios, y luego pide
      cita: comprueba que el asistente consulta disponibilidad real, te ofrece un
      complemento y la crea.
- [ ] Pide por WhatsApp cambiar o cancelar esa misma cita (con más de 1 hora de antelación):
      comprueba que el asistente lo hace directamente.
- [ ] Desde `/admin/conversaciones`, responde tú manualmente a una conversación y comprueba
      que el mensaje llega por WhatsApp.
- [ ] Crea un servicio y un barbero nuevo desde `/admin/servicios` y `/admin/profesionales`,
      y comprueba que aparecen en la reserva.
- [ ] En cuanto tengas una plantilla aprobada por Meta y registrada en `/admin/plantillas`:
      crea una campaña de prueba a un segmento pequeño y compruébala en `/admin/campanas`;
      y confirma que el workflow de GitHub Actions se ejecuta (pestaña Actions del repo).

---

## Cómo seguir construyendo esto con Claude

Este proyecto va a evolucionar contigo. Cuando quieras un cambio o una función nueva
(las de la lista "Qué falta todavía", o cualquier otra idea):

1. Descríbele a Claude qué quieres conseguir, en lenguaje normal.
2. Si tienes ya una carpeta de este proyecto abierta con Claude, dile que trabaje
   directamente sobre estos archivos.
3. Después de cada cambio importante, pide que lo pruebe (`npm run build`) antes de subirlo,
   igual que se ha hecho para preparar esta primera versión.

## Estructura del proyecto (para orientarte)

```
supabase/schema.sql                    Toda la base de datos y las reglas de seguridad
supabase/seed.sql                      Datos de ejemplo opcionales
supabase/actualizar-datos-reales.sql   Catálogo real de servicios/barberos/horarios (re-ejecutable)
supabase/actualizar-funcionalidad-avanzada.sql  Tablas de campañas/plantillas/recordatorios (re-ejecutable)
lib/availability.ts        Cálculo de huecos libres (el corazón del motor de reservas)
lib/booking.ts             Crear, cancelar y reprogramar una reserva (app, panel y WhatsApp)
lib/aiAssistant.ts         El asistente de WhatsApp con IA (prompt + herramientas)
lib/whatsapp.ts            Envío de mensajes de WhatsApp (texto libre y plantillas)
lib/segmentacion.ts        Cálculo de a qué clientes llega una campaña
.github/workflows/recordatorios.yml     Disparador externo (GitHub Actions) de los recordatorios
app/reservar/              Página pública de reserva
app/admin/                 Panel de control (agenda, servicios, equipo, CRM, campañas, informes...)
app/api/                   Toda la lógica del servidor (reservas, disponibilidad, webhook…)
app/api/cron/recordatorios Endpoint que manda los recordatorios (llamado por GitHub Actions)
```
