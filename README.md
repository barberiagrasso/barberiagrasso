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
  móvil (es una web responsive), y además **se puede instalar** como si fuera una app: en
  Android/Chrome aparece un aviso con un botón "Instalar" (usa el prompt nativo del propio
  navegador); en iPhone/Safari, que no tiene ese prompt, se le explican los dos toques
  (Compartir → Añadir a pantalla de inicio). Una vez instalada, se abre a pantalla completa,
  con su propio icono, sin la barra de direcciones. Todavía no está en App Store/Google Play
  — eso es un paso aparte y más costoso, ver "Qué falta" más abajo.
- **Panel de control** (`/admin`), con gestión visual completa (sin tocar Supabase):
  - **Agenda**: creación, cancelación y cambios de estado de citas por sede. Cada cita tiene
    un botón **"Avisar disponible"**: si un barbero termina antes de lo previsto, avisa por
    WhatsApp (con confirmación previa) a su siguiente cliente de ese mismo día por si quiere
    venir antes — el hueco reservado sigue intacto si no contesta o prefiere mantenerlo.
  - **Servicios**: catálogo, precios, duración y en qué desplegable aparece cada uno.
  - **Equipo**: alta de barberos, a qué sedes y servicios están asignados, y su horario
    semanal. Desde aquí también le das a cada barbero su propio acceso al panel — ver
    "Cuentas de equipo" más abajo.
  - **Vacaciones**: bloqueos puntuales por barbero o por sede.
  - **Clientes (CRM)** (`/admin/clientes`): listado con su estado de consentimiento comercial,
    su saldo de fidelización y el histórico de movimientos de ese saldo (acumulaciones,
    canjes, reembolsos y ajustes manuales) — ver "Fidelización" más abajo.
  - **Cuentas de cliente** (`/acceso`): el cliente se registra y entra con teléfono y
    contraseña. Si olvida la contraseña, pulsa "¿Olvidaste tu contraseña?", recibe un código
    de 6 dígitos **por WhatsApp** (nunca por email — ver por qué en la sección de abajo) y
    elige una nueva. Al crear la cuenta, también se le avisa por WhatsApp de que ya está dada
    de alta — ver "Recuperar contraseña y aviso de alta" más abajo.
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

### Producción: errores y copias de seguridad

No hace falta que configures nada nuevo para esto — se apoya en lo que ya tienes montado del
paso de recordatorios (Supabase + GitHub Actions), sin cuentas ni servicios externos nuevos
que aprender.

- **Errores del sistema** (`/admin/errores`): cualquier fallo real al crear o cancelar una
  reserva, procesar un mensaje de WhatsApp, o al ejecutar los recordatorios/campañas
  automáticas, queda anotado ahí — con un aviso en la banda ámbar de arriba de cualquier
  pantalla del panel, igual que ya pasa con los fallos del asistente de IA. Puedes marcarlos
  como resueltos para ir vaciando la lista. Antes, si algo fallaba, solo quedaba en los logs
  de Vercel (que no sueles mirar); ahora lo ves tú mismo, en español, sin salir del panel.
- **Copia de seguridad diaria**: el archivo `.github/workflows/backup.yml` llama una vez al
  día a `/api/cron/backup`, que exporta todos los datos del negocio (clientes, citas,
  servicios, conversaciones...) a un archivo. GitHub lo guarda como "artifact" durante 30
  días — en tu repositorio, pestaña **Actions** → la ejecución del día que quieras →
  **Artifacts**, al final de la página. Reutiliza los mismos secretos `CRON_SECRET` y
  `APP_URL` que ya tienes puestos para los recordatorios: en cuanto hagas `git push`, empieza
  a funcionar sola. El esquema de la base de datos (las tablas y sus reglas) ya estaba a
  salvo desde el principio, versionado en `supabase/*.sql` dentro de este mismo repositorio;
  esto respalda los datos día a día. Si alguna vez necesitas restaurar algo desde una de
  estas copias, descarga el archivo del día que te interese y pídeselo a Claude.

### Fidelización: saldo acumulable y tarjeta digital

Cada cliente acumula automáticamente un **10%** de lo que se gasta en cada cita (servicio +
complementos) como saldo, válido en cualquiera de las dos sedes. Las piezas:

- **Cuándo se acumula**: solo al marcar una cita como **completada** desde `/admin/dashboard`
  (nunca al reservarla) — así no se premia una cita que luego se cancela o no se presenta.
  Si la cita se había pagado con saldo, no genera saldo nuevo (no hubo gasto real que
  recompensar).
- **Cómo se canjea**: el cliente ve su saldo disponible en el paso de confirmación de
  `/reservar` (y el barbero, en la cita rápida del panel) y puede marcar "pagar con mi saldo"
  **solo si el saldo cubre el total exacto** de esa cita — no se admite canje parcial, tal y
  como pediste. Si no llega, simplemente no aparece la opción.
- **Si se cancela o no se presenta**: el saldo canjeado se devuelve íntegro al cliente
  automáticamente — cancelar o faltar a una cita no le debe costar el saldo que ya tenía
  ganado.
- **Ficha de cada cliente** (`/admin/clientes/[id]`): saldo actual, histórico completo de
  movimientos (de dónde salió cada céntimo) y un botón para hacer un **ajuste manual** (p. ej.
  un detalle comercial), siempre con motivo obligatorio y quedando registrado quién lo hizo.
- **El asistente de WhatsApp con IA NO puede canjear saldo** — de momento, pagar con saldo
  solo se puede hacer desde `/reservar` (el cliente, con su sesión iniciada) o desde el panel
  (un barbero, en persona). Es una decisión deliberada: mover saldo es mover dinero de
  verdad, y prefiero que eso pase siempre por una sesión de cliente autenticada o por una
  persona del equipo, nunca por una conversación automática de IA. Si más adelante quieres
  que la IA también lo ofrezca por WhatsApp, pídeselo a Claude.
- **Tarjeta digital**: en `/perfil/tarjeta`, cualquier cliente puede ver y **descargar una
  imagen** de su tarjeta (logo, su nombre y su saldo actualizado) para guardarla donde
  quiera — funciona ya, hoy, sin ninguna cuenta ni coste adicional.
- **Apple Wallet / Google Wallet reales**: el código ya está preparado (`lib/wallet/`,
  `app/api/wallet/`) para que el cliente pueda añadir la tarjeta directamente a su Wallet del
  móvil, con el saldo actualizándose. Los botones ya están en `/perfil/tarjeta`, pero
  aparecen desactivados ("Todavía no está activado") hasta que completes esto:
  - **Apple Wallet** necesita una cuenta de Apple Developer (de pago, ~99$/año) y generar un
    certificado de "Pass Type" — la guía paso a paso, con los nombres exactos de las
    variables de entorno que hay que añadir en Vercel, está comentada al principio de
    `lib/wallet/appleWallet.ts`.
  - **Google Wallet** necesita una cuenta de Google Cloud (gratis) y que Google apruebe tu
    solicitud como "issuer" (puede tardar unos días) — la guía, igual de detallada, está en
    `lib/wallet/googleWallet.ts`.
  - En cuanto añadas esas variables de entorno en Vercel, los botones se activan solos, sin
    tocar ni una línea de código más.

### Recuperar contraseña y aviso de alta: dos plantillas más

El identificador real de cada cliente en toda la app es su **teléfono**, no un email — de
hecho, la cuenta técnica de acceso (Supabase Auth) se crea con una dirección inventada a
partir del teléfono que nadie lee nunca, así que el sistema de "recuperar contraseña por
email" de serie no serviría de nada aquí. Por eso, tanto el código para recuperar la
contraseña como el aviso de que la cuenta ya está creada se mandan **por WhatsApp**, igual
que los recordatorios y las campañas: son mensajes que inicia el negocio sin que el cliente
haya escrito antes, así que también hace falta una **plantilla aprobada por Meta** para cada
uno (repite los pasos de la sección "Recordatorios y campañas" de arriba, con estos textos):

- **Recuperar contraseña** — Meta obliga a que un código de un solo uso vaya en la
  categoría especial **"Autenticación"**, no "Utility": el texto NO lo escribes tú (Meta
  pone uno fijo, tipo "123456 es tu código de verificación"), solo eliges un botón para
  copiar el código y, opcionalmente, activas el aviso de caducidad (ponle 10 minutos, para
  que coincida con lo que dura de verdad) y el de seguridad ("no compartas este código").
  Regístrala en `/admin/plantillas` con tipo "Recuperar contraseña (código)" y variables
  `codigo` (una sola, sin `nombre` — Meta no permite poner el nombre en este tipo de
  plantilla).
- **Bienvenida al registrarse** — esta sí es una plantilla normal, categoría "Utility",
  con el texto que quieras. Tipo "Bienvenida al registrarse", variables `nombre, telefono`.
  Texto sugerido:
  `¡Hola {{1}}! Tu cuenta en Barbería Grasso ya está creada con el número {{2}}. Desde ahí puedes reservar, ver tus citas y tu saldo de fidelización.`

Mientras no registres estas dos plantillas, ambas funciones simplemente no mandan el
WhatsApp (sin dar ningún error al cliente): el cliente que pide recuperar su contraseña ve
igualmente el mensaje de "te hemos enviado un código" (para no delatar si un teléfono tiene
o no cuenta), y el registro se completa igual sin el aviso de bienvenida. En ambos casos
queda anotado en `/admin/errores` para que lo veas.

El código de recuperación caduca a los 10 minutos, solo vale una vez, y se guarda **hasheado**
(nunca en texto plano) en la tabla `codigos_recuperacion` — que, como es un rastro totalmente
temporal, no se incluye en la copia de seguridad diaria (igual que ya pasaba con
`intentos_seguridad`).

### Cuentas de equipo: un acceso propio para cada barbero, con permisos reducidos

Hasta ahora solo existía tu cuenta, con acceso a todo el panel. Ahora cada barbero puede
tener la suya, con dos diferencias respecto a la tuya:

- **Solo ve una parte del panel.** Una cuenta de equipo (rol "barbero") no ve ni puede
  entrar a **Equipo, Campañas, Plantillas ni Informes** — ni en el menú ni escribiendo la
  URL a mano (está bloqueado también por detrás, no es solo que el botón esté oculto). Todo
  lo demás (Agenda, Clientes, Servicios, Vacaciones, WhatsApp, Errores) lo ve igual que tú.
  Tu cuenta sigue siendo rol "admin", con acceso a todo — eso no ha cambiado.
- **Entra con un usuario sencillo, no con email.** Igual que el cliente se identifica por
  teléfono, cada barbero se identifica por un "usuario" corto (p. ej. `lucas`, o `juan.molinos`
  cuando hay dos con el mismo nombre) en vez de un email — por debajo sigue siendo Supabase
  Auth, con un email inventado que nadie usa nunca. Tú sigues entrando con tu email real; el
  campo de `/admin/login` ahora acepta cualquiera de los dos.

**Cómo dar de alta (o resetear) el acceso de un barbero**: desde `/admin/profesionales`,
junto a su nombre, pulsa **"Crear acceso al panel"**. Te enseña el usuario generado y una
contraseña temporal (`123456`) — apúntala en ese momento, es la única vez que se ve, aunque
siempre puedes generar una nueva pulsando el mismo botón (ahora dirá "Acceso: usuario
(restablecer)"). En su primer inicio de sesión, el panel le obliga a elegir su propia
contraseña (mínimo 8 caracteres) antes de dejarle ver nada — no hay forma de saltarse ese
paso.

Ahora mismo ya tienen su acceso creado los 7 profesionales activos:

| Profesional | Usuario |
| --- | --- |
| Arthur | `arthur` |
| Cristian | `cristian` |
| Daniel | `daniel` |
| David | `david` |
| Juan (Avenida de las Ciudades) | `juan.avenida.ciudades` |
| Juan (Los Molinos) | `juan.molinos` |
| Lucas | `lucas` |

Todos con la contraseña temporal `123456`, pendiente de cambiar en su primer acceso (salvo
Lucas, que ya la cambió al probarlo). Dales su usuario (no hace falta que sepan el email
inventado de detrás) y esa contraseña para que entren la primera vez.

### Comisiones: tramos de facturación configurables, uno por barbero

Cada barbero cobra una comisión sobre lo que factura cada mes, según en qué tramo caiga su
**facturación total del mes** (no es progresivo por escalones como el IRPF: se mira el total
facturado, se identifica el tramo en el que cae, y ese porcentaje se aplica a TODA la
facturación, no solo a la parte dentro del tramo). Por debajo del tramo más bajo no hay
comisión. Los tramos con los que arranca son los que definiste:

| Facturación del mes | Comisión |
| --- | --- |
| Hasta 3.500€ | 0% |
| 3.500€ – 3.800€ | 35% |
| 3.800€ – 4.000€ | 38% |
| 4.000€ – 4.500€ | 40% |
| A partir de 4.500€ | 42% |

**Dónde verlo**: nueva pestaña **Comisiones** en el menú del panel (para todo el mundo, no
solo para ti) y una pestaña más dentro de **Informes** (esa, como el resto de Informes, solo
para tu rol "admin"):

- **Tú (admin)** ves a todo el equipo: facturación, tramo aplicado y comisión de cada
  barbero, mes a mes (con flechas para moverte a meses anteriores), más el total a pagar ese
  mes y un botón para exportarlo a CSV. Justo debajo puedes **editar los tramos** (importes y
  porcentajes, añadir o quitar tramos) — se guarda al momento y se refleja tanto en tu propia
  vista como en la de cada barbero.
- **Cada barbero** solo ve **su propia** facturación, tramo y comisión de cada mes — nunca la
  de sus compañeros, ese filtro está aplicado en el servidor, no solo escondido en la
  pantalla. También ve: un aviso de "te faltan X€ para subir a F_ y pasar del X% al Y%" cuando
  le falta poco para el siguiente tramo; su ranking del mes entre todo el equipo (solo su
  posición, "3º de 7" — nunca la facturación de sus compañeros); una barra visual con su
  recorrido por los tramos; un simulador con un slider ("si facturara tanto, me llevaría
  tanto"); y la tabla de tramos vigente (en solo lectura, no puede editarla).

Se calcula siempre al momento a partir de las citas ya completadas ese mes (igual que el resto
de Informes) — no hace falta "cerrar" el mes ni ningún paso manual: el día 1, cuando toque
pagar, el mes anterior ya está fijo porque no se pueden completar citas con fecha pasada.

### Productos: venta en persona, con su propia comisión

Además de los servicios, hay un catálogo de **productos** (champús, ceras, productos de barba…)
que **no se pueden ver ni comprar desde la reserva online** — solo existen para que el barbero
los añada a una cita ya cerrada. Se editan en la pestaña **Productos** del panel (nombre, precio,
categoría, activo/inactivo), igual que Servicios.

Al pulsar **"Completada"** en una cita, se abre una pantalla de **"Finalizar cita"** donde el
barbero puede, todo de una vez:

- cambiar el servicio principal que hizo,
- añadir o quitar complementos (cejas, lavado…),
- añadir los productos que haya vendido en el momento, con su cantidad,
- corregir quién la hizo de verdad,
- y ajustar la hora real de inicio y de fin.

Una vez guardada, la cita queda completada y esa pantalla ya no se vuelve a abrir para ella (si
hay que corregir algo después, se hace a mano en Supabase).

La comisión de productos es **aparte** de la de servicios: un único **porcentaje plano** sobre
todo lo vendido ese mes (empieza en 15%, editable por ti en la pestaña Comisiones), **sin
tramos y desde el primer euro** — a diferencia de los servicios, no hace falta llegar a ningún
mínimo. No cuenta para el ranking, que sigue siendo solo por facturación de servicios. Los
productos tampoco generan saldo de fidelización al cliente ni aparecen en ningún sitio de la
app o del historial que ve el cliente — se quedan enteramente dentro del panel.

## Qué falta todavía (siguientes iteraciones, pídeselo a Claude cuando quieras)

- **Publicarla en App Store / Google Play**: la reserva ya se puede "instalar" desde el
  navegador (ver arriba), que cubre la sensación de app para la mayoría de clientes sin coste
  ni cuenta de desarrollador. Estar además en las tiendas de apps es un paso aparte y más
  costoso (cuota de Apple, revisión de ambas tiendas, mantener el envoltorio con Capacitor o
  similar) — solo tiene sentido si más adelante quieres esa presencia por marketing o
  prestigio, no por funcionalidad.
- **Pagos y señales anticipadas** (por ejemplo con Stripe) para reducir las citas fantasma.
- **Activar Apple Wallet / Google Wallet reales** para la tarjeta de fidelización — ver la
  sección de arriba, el código ya está listo, solo falta que crees las cuentas.
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
supabase/actualizar-monitorizacion-produccion.sql  Tabla de errores del sistema (re-ejecutable)
supabase/actualizar-fidelizacion.sql   Saldo de fidelización: tablas, columnas y función (re-ejecutable)
supabase/actualizar-recuperacion-password.sql  Códigos de recuperación y plantillas nuevas (re-ejecutable)
supabase/actualizar-comisiones.sql     Tabla de tramos de comisión + función de reemplazo (re-ejecutable)
supabase/anadir-productos.sql          Catálogo de productos, cita_productos y comisión plana de productos (re-ejecutable)
lib/comisiones.ts          Cálculo de comisión por tramos, validación y utilidades de mes
lib/productos.ts           Cálculo de la comisión plana de productos (sin tramos)
lib/horarioLocal.ts        Conversión hora de reloj (Europe/Madrid) ↔ instante UTC, para corregir horarios a mano
app/admin/comisiones/      Comisión propia (barbero) o de todo el equipo (admin), con edición de tramos y del % de productos
app/admin/productos/       Catálogo de productos (nombre, precio, categoría, activo/inactivo)
app/api/admin/comisiones/  Facturación/comisión por barbero del mes + CRUD de tramos + % de comisión de productos
app/api/admin/productos/   CRUD del catálogo de productos
app/api/admin/citas/[id]/finalizar/  Cierra una cita: servicio, complementos, productos, barbero y horario en un paso
app/admin/dashboard/FinalizarCitaModal.tsx  Pantalla que se abre al marcar una cita como "Completada"
lib/availability.ts        Cálculo de huecos libres (el corazón del motor de reservas)
lib/booking.ts             Crear, cancelar y reprogramar una reserva (app, panel y WhatsApp)
lib/fidelizacion.ts        Acumular, canjear y reembolsar saldo de fidelización
lib/recuperacionPassword.ts  Generar/hashear/verificar el código de recuperación de contraseña
app/api/auth/recuperar/    Pedir código y confirmarlo con contraseña nueva
lib/wallet/                Apple Wallet / Google Wallet reales (preparado, ver README arriba)
lib/aiAssistant.ts         El asistente de WhatsApp con IA (prompt + herramientas)
lib/whatsapp.ts            Envío de mensajes de WhatsApp (texto libre y plantillas)
lib/segmentacion.ts        Cálculo de a qué clientes llega una campaña
lib/errorLog.ts            Registrar un error de producción para verlo en /admin/errores
lib/adminAuth.ts           requireAdmin / requireRolAdmin (páginas del panel)
lib/adminApiAuth.ts        requireAdminApi / requireRolAdminApi (rutas /api/admin/...)
lib/usuarioEquipo.ts       Usuario ↔ email sintético para las cuentas de equipo (barberos)
app/admin/cambiar-password/  Cambio de contraseña (obligatorio en el primer acceso de un barbero)
app/api/admin/equipo/      Crear o resetear el acceso al panel de un barbero
instrumentation.ts         Red de seguridad: captura cualquier error que se escape sin registrar
app/manifest.ts            Manifest de la PWA (nombre, iconos, colores — instalar como app)
public/sw.js               Service worker mínimo (solo para ser "instalable", nunca cachea datos)
components/pwa/            Registro del service worker y aviso de "Instalar app" en /reservar
.github/workflows/recordatorios.yml     Disparador externo (GitHub Actions) de los recordatorios
.github/workflows/backup.yml            Disparador externo (GitHub Actions) de la copia de seguridad
app/reservar/              Página pública de reserva
app/perfil/tarjeta/        Tarjeta digital de fidelización (descarga + Apple/Google Wallet)
app/admin/                 Panel de control (agenda, servicios, equipo, CRM, campañas, informes, errores...)
app/admin/clientes/        Ficha de cada cliente: saldo, histórico y ajuste manual
app/api/                   Toda la lógica del servidor (reservas, disponibilidad, webhook…)
app/api/cron/recordatorios Endpoint que manda los recordatorios (llamado por GitHub Actions)
```
