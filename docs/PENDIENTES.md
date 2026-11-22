# Pendientes para terminar de activar (para Diego)

Actualizado: 15/11/2026. Todo el código ya está en `main` y publicado en Vercel.
Lo que queda son activaciones que necesitan acceso a Supabase, Vercel o
cuentas externas. Marca cada punto cuando esté hecho.

## 0. SEGURIDAD — lo primero (auditoría 22/11/2026)

- [ ] Ejecutar `supabase/seguridad-solo-dueno.sql`: ahora mismo un barbero
      con su usuario podría leer o borrar los datos de todos los clientes
      directamente en la base de datos, saltándose la app.
- [ ] Vercel: añadir `WHATSAPP_APP_SECRET` (Meta → la app de WhatsApp →
      Configuración → Básica → "Clave secreta de la app"). Sin ella, alguien
      que conozca la dirección del webhook puede hacerse pasar por un
      cliente por WhatsApp y cancelarle citas. Con ella, los mensajes
      falsos se rechazan solos.
- [ ] Vercel: añadir `CLIENTE_SESSION_SECRET` (una frase larga al azar).
- [ ] Rotar las claves que se pegaron en el chat (service role de
      Supabase, token de WhatsApp, clave de Anthropic, token de GitHub,
      CRON_SECRET).
- [ ] GitHub: poner el repositorio en **privado** y activar Dependabot
      (Settings → Code security) para avisos de librerías con fallos.

## 1. Probador de estilos con IA (sección "Asesor" del panel)

La pizarra, la guía de estilos y el visagismo ya funcionan. Falta la
generación de la foto del cliente con el corte nuevo.

- [ ] Crear una clave de la API de Gemini en https://aistudio.google.com
      ("Get API key") con la cuenta de la barbería y activar la facturación.
      Coste orientativo: ~0,03 € por foto generada.
- [ ] Vercel → proyecto barberiagrasso → Settings → Environment Variables:
      añadir `GEMINI_API_KEY` (Production) y volver a desplegar.
- [ ] Opcional: `GEMINI_IMAGE_MODEL` para cambiar de modelo. Por defecto
      `gemini-3.1-flash-image` ("Nano Banana 2"); más barato:
      `gemini-3.1-flash-lite-image`.
- [ ] Probar en la tablet: Asesor → foto → elegir corte → "Probar". Si la
      cara cambia demasiado, ajustar el texto de la instrucción en
      `lib/probadorIA.ts`.

Código: `lib/probadorIA.ts`, `app/api/admin/asesor/*`,
`app/admin/(protected)/asesor/AsesorPizarra.tsx`. Límite: 60 pruebas al
día por cuenta del equipo.

## 2. Scripts SQL de Supabase (proyecto `utidfpsjgpwwecqsnnls`)

Ejecutar en el SQL Editor, en este orden (se pueden ejecutar más de una vez):

- [ ] `supabase/anadir-portafolio-y-resenas.sql`: portafolio del panel y
      notas de Booksy/Google. Sin esto no se pueden subir fotos desde
      Mi barbería → Portafolio.
- [ ] `supabase/anadir-grassocoins.sql`: si no se ejecutó al fusionar
      GrassoCoins en main.
- [ ] `supabase/anadir-stock-por-sede.sql`: sección Stock (stock por sede,
      encargados y pedidos). Sin esto, la pantalla Stock avisa de que
      falta activarlo y el cobro descuenta stock como antes.
- [ ] `supabase/anadir-cierre-caja.sql`: apertura y cierre de caja
      (Finanzas → Caja). Crea la tabla `caja_dias`, el encargado de caja
      por sede y el bucket privado `caja` para la foto del sobre.
- [ ] Vercel: añadir `NEXT_PUBLIC_WHATSAPP_ATENCION` (número de WhatsApp de
      la barbería, el que atiende la IA, formato 34600000000). Sin él no
      sale el enlace "¿No te llega el código? Escríbenos por WhatsApp" en
      la pantalla de acceso ni al reservar. Después hay que redesplegar.
- [ ] Vercel: añadir `CAJA_AVISO_TELEFONO` (móvil de David, formato
      34600000000) para que le llegue el resumen de cada cierre por
      WhatsApp. Ojo: WhatsApp solo entrega texto libre si David ha escrito
      al número de la barbería en las últimas 24 h; para que llegue
      siempre hay que crear una plantilla aprobada en Meta.

Mejor todavía: transferir el proyecto de Supabase a la organización de
David ("barberiagrasso's Org") para que la base de datos sea suya.

## 3. Cosas que tiene que pulsar David en el panel

- [ ] `/admin/importar-horarios`: revisar los horarios de Booksy de las dos
      sedes y pulsar "Guardar horarios".
- [ ] `/admin/importar-servicios`: poner los precios que faltan (camuflaje
      de canas, hidratación, limpieza facial, cejas, depilación nariz y
      orejas) y pulsar "Crear servicios".
- [ ] Stock (cuando esté el SQL): elegir el encargado de cada sede y hacer
      el primer recuento.
- [ ] Caja (cuando esté el SQL): elegir el encargado de caja de cada sede.

## 4. Otros pendientes

- [ ] WhatsApp: el acceso de clientes por código ("Mi perfil") usa la
      plantilla de tipo `recuperacion_password` (o `codigo_acceso` si se
      crea). Comprobar en /admin/plantillas que está activa y aprobada en
      Meta; si falla, sale en Errores.
- [ ] Velocidad: las funciones de Vercel ya se ejecutan en París (`cdg1`, archivo vercel.json). Comprobar en
      Supabase → Project Settings → región del proyecto: si NO es Europa (Frankfurt, Irlanda, Londres, París),
      cambiar `regions` en vercel.json a la región más cercana a la base de datos.
- [ ] Política de privacidad: añadir titular (nombre o empresa), NIF y
      email de contacto en `app/politica-privacidad/page.tsx`.
- [ ] Casilla de ofertas en la reserva: está desmarcada por la ley
      (RGPD/LSSI). David tiene que decidir si se queda así con un texto más
      atractivo o si la quiere marcada de serie, sabiendo el riesgo.
- [ ] Opiniones de Booksy: importarlas cuando David consiga el export.
- [ ] Seguridad: rotar las claves que se compartieron en el chat al montar
      el proyecto (token de GitHub, service role de Supabase, token de
      WhatsApp, clave de Anthropic, CRON_SECRET).

## Ideas aprobadas, sin empezar

- "Mi día" para cada barbero: meta diaria y mensual, comisión y objetivo
  del día.
- Meta diaria de facturación por sede, visible para el encargado y el
  equipo, con bote semanal de equipo.
- Barbero destacado del mes (meta 50 %, calidad 30 %, extras 20 %).
- Resumen semanal "Grasso CEO IA" para David por WhatsApp.

Análisis técnico de Rendimiento: `docs/grasso-performance-ia.md`.
