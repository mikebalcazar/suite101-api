# FSMAIL: la plataforma de correo de Forespot. Qué se decidió y cómo se arma

Escrito el 17-oct-2026, en la sesión donde Mike pidió «una plataforma de
correo electrónico … con un usuario pueda administrar varios correos de
varios dominios, en automático cada dominio me separa las bandejas y dentro
de las bandejas cada dirección».

## Lo que Mike decidió (17-oct-2026, con botones)

1. **Buzones propios, no Gmail.** Primero se le ofreció: buzones propios en la
   suite / agregador sobre Gmail API / híbrido. Contestó cambiando el marco:
   «ahorita no voy a usar el dominio de FORESPOT, vamos a usar uno nuevo que
   se llama **FSMAIL.com** y ahí entras y abres una cuenta con un usuario, y
   ya adentro de tu cuenta puede ligar los dominios que necesites administrar
   correos y las direcciones que quieras dar de alta para recibir y enviar
   correos. Todos bajo un mismo username.» Es un **producto nuevo**: registro
   público, un username, N dominios, N direcciones por dominio.
2. **Repositorio nuevo `fsmail`**, producto aparte: su Worker, su D1, su R2,
   su dominio. No es la app 12 de la suite ni un módulo de `suite101-api`.
   Las otras dos opciones (dentro de suite101-api; app de la suite con
   cuentas de empresa) se descartaron por mezclar productos y porque no
   tienen registro público con username.

## Lo que se midió antes de preguntar (17-oct-2026)

- `fsmail.com` **disponible** en GoDaddy (también `fsmail.mx`, `fsmail.app`).
- `forespot.com` y `taller101.mx`: DNS en GoDaddy, MX en Google Workspace
  (`aspmx.l.google.com`). `suite101.app`: DNS en Cloudflare, sin MX.
- **Cloudflare Email Routing no sirve para recibir dominios de clientes**:
  «You must be using Cloudflare DNS to use Email Service». Un cliente de
  FSMAIL no va a mudar su DNS a nuestra cuenta. Descartado como receptor.
- **Resend sí recibe en dominios ajenos** («Receiving»): el cliente agrega en
  SU DNS el MX de Resend (debe ser la prioridad más baja) y los registros de
  verificación del dominio (DKIM; el SPF de Resend sólo si también envía).
  Resend manda un webhook `email.received` con metadatos y el contenido se
  baja por API (HTML, texto, cabeceras, adjuntos con URL temporal). Los
  dominios se dan de alta por API. Ya es el proveedor de envío de la suite.
- Precios de Resend (resend.com/pricing, 17-oct): Free 3,000 correos/mes y 3
  dominios; Pro 20 USD 50,000/mes y 10 dominios; Scale 90 USD 100,000/mes y
  1,000 dominios; +100 dominios por 20 USD/mes. **Los recibidos cuentan en la
  misma cuota que los enviados.** Retención 30 días en todos: el buzón de
  verdad es el nuestro (R2), Resend es sólo el cartero.
- Pendiente de medir: qué es un «inbox» de Resend (3 incluidos, 1 USD extra)
  y si hace falta para recibir en dominio propio o sólo para los buzones
  `<id>.resend.app`. Se mide con la cuenta real antes de la fase 1.

## Cómo se arma

```
cliente ──MX──▶ Resend (recibe, verifica SPF/DKIM/DMARC del remitente)
                  │ webhook email.received (firmado)
                  ▼
            Worker fsmail ── baja el mensaje por API de Resend
                  │            guarda MIME + adjuntos en R2
                  │            indexa en D1: cuenta, dominio, dirección, hilo
                  ▼
            interfaz fsmail.com ── bandejas por dominio → por dirección
                  │
                  └── enviar: Worker → Resend /emails con el dominio del cliente
```

**Un Worker (`fsmail`), un D1, un R2.** Igual que la suite: TypeScript, sin
framework de servidor, migraciones numeradas, pruebas con vitest y
Playwright, despliegue por Actions con `verificar.yml`.

**Cuentas.** Registro público con username + correo de recuperación. Entrada
por código al correo, como la suite (`src/auth/correo.ts` es la referencia;
se copia el patrón, no el código, porque no comparten D1). Sesión en cookie
propia del dominio fsmail.com.

**Dominios.** `POST /dominios` da de alta el dominio en Resend por API y le
enseña al usuario los registros exactos que debe poner en su DNS (MX, DKIM,
SPF opcional, DMARC recomendado). Un cron del Worker pregunta a Resend el
estado y marca «verificado». Nada de pedirle al usuario que mueva su DNS a
Cloudflare.

**Direcciones.** Dentro de un dominio verificado el usuario crea
`ventas@`, `info@`… y un **catch-all** opcional por dominio. Lo que llega a
una dirección no dada de alta y sin catch-all se guarda como «sin dirección»
en el dominio, no se tira: el usuario decide.

**Bandejas.** La separación que pidió Mike sale sola del índice: cada mensaje
lleva `cuenta → dominio → dirección`. La interfaz enseña dominios como
primer nivel y direcciones como segundo; una vista «Todo» junta la cuenta.
Hilos por `Message-ID`/`In-Reply-To`/`References`.

**Envío.** Desde cualquier dirección de un dominio verificado, por Resend.
Firma DKIM del dominio del cliente, no del nuestro. Respuestas con
`In-Reply-To` para que el hilo cuadre en el otro lado.

**Lo que NO se construye en la primera versión**: filtro de spam propio (lo
que Resend acepta se guarda; se marca lo que falle DMARC), calendario,
contactos, IMAP/POP para clientes externos, etiquetas libres. Se agregan
cuando Mike los pida, uno por uno.

## Modelo de datos (D1 de fsmail)

```
cuentas      id, username (único), correo_recuperacion, creada
dominios     id, cuenta_id, dominio (único), resend_id, estado, catch_all, creada
direcciones  id, dominio_id, local (ventas), nombre, activa, creada
mensajes     id, cuenta_id, dominio_id, direccion_id (null = sin dirección),
             hilo_id, resend_id, de, para, asunto, fecha, leido, carpeta
             (entrada/enviados/archivo/basura), r2_llave, tamano
adjuntos     id, mensaje_id, nombre, tipo, tamano, r2_llave
hilos        id, cuenta_id, raiz_message_id, ultimo, cuenta_mensajes
```

MIME completo y adjuntos en R2, nunca en D1. D1 guarda sólo el índice y el
texto necesario para listar y buscar (asunto, remitente, primer renglón).

## Fases

1. **Cimientos**: repo, Worker, D1 con migraciones 0001–0003, registro y
   entrada por código, alta de dominio con registros DNS a la vista, webhook
   de Resend verificado por firma, guardar en R2 + índice, bandeja por
   dominio y dirección, leer un mensaje. Prueba con un dominio de Mike en
   staging, nunca forespot (OPERAR §8).
2. **Enviar y responder**: compositor, responder con hilo, enviados, borradores.
3. **Vivir ahí**: búsqueda, archivo/basura, catch-all, adjuntos descargables,
   móvil 390×844.

## Lo que es de Mike, una sola vez (OPERAR §9)

1. Registrar `fsmail.com` (GoDaddy) y poner su DNS en Cloudflare (zona
   nueva), para que el Worker tenga dominio propio y rutas como suite101.app.
2. Crear el repositorio `mikebalcazar/fsmail` en GitHub y agregarlo a la
   sesión. Con el repo vacío la sesión lo arma todo.
3. Poner los secretos del Worker `fsmail`: `RESEND_API_KEY` (la misma
   llave de la suite: decisión del 17-oct, abajo), `RESEND_WEBHOOK_SECRET`
   (nuevo, lo da Resend al crear el webhook), `CLOUDFLARE_API_TOKEN`,
   `CLOUDFLARE_ACCOUNT_ID`.

Cada una se le pregunta por separado, con botones, cuando toque.

## El cartero: Resend, con la cuenta existente (Mike, 17-oct-2026)

Mike preguntó tres veces antes de decidir, y las respuestas quedan aquí para
no repetirlas:

- **«¿Para qué es Resend?»** FSMAIL es el cliente (bandejas, leer,
  redactar); Resend es el cartero que habla SMTP con el mundo: recibe lo que
  llega al MX del negocio y lo entrega por webhook, y manda lo que FSMAIL
  redacta firmado con el DKIM del dominio del negocio.
- **«¿Por qué FSMAIL no implementa el cartero SMTP?»** Workers no escuchan
  puertos (recibir SMTP exige puerto 25 abierto 24 h) y Cloudflare bloquea el
  25 de salida. Un servidor propio (VPS + Postfix/Stalwart) es viable pero
  trae IP sin reputación (semanas en basura), puerto 25 por desbloquear,
  PTR/SPF/DKIM/DMARC/TLS/colas/rebotes/listas negras/spam, operación 24/7 y el
  riesgo de que un negocio abusivo tumbe a todos. Sería el primer servidor que
  la suite opera. Se le ofrecieron Resend, servidor propio y Amazon SES.
- **«¿Qué costo con la cuenta existente?»** La cuota de Resend es enviados +
  recibidos, suite + FSMAIL juntos. Free: 3 dominios (la suite ocupa 1 con
  `envios.taller101.mx`) y 3,000 correos/mes → 2 negocios gratis. Pro 20 USD:
  10 dominios y 50,000/mes → 9 negocios. +100 dominios por 20 USD. Scale 90
  USD: 1,000 dominios y 100,000/mes. El plan actual no está escrito en ningún
  repositorio: se ve en resend.com → Settings → Billing.

**Decisión (botones): la cuenta existente.** Consecuencias dichas antes de
decidir: sólo 2 negocios gratis; cuota y reputación compartidas con los
códigos de acceso de la suite; la misma llave en dos Workers. El cartero va
detrás de `cartero.ts` para poder cambiarlo después sin tocar bandejas.

## Preguntas que faltan (una por una, con botones)

- ¿Desde qué dominio salen los correos propios de FSMAIL (código de acceso,
  avisos)? `envios.fsmail.com` ocupa un dominio más de la cuota; reusar
  `envios.taller101.mx` no ocupa ninguno pero firma como taller101.
- ¿Cuota de almacenamiento por cuenta y qué pasa al llenarse?
- ¿La primera prueba real con qué dominio (uno nuevo de prueba, no forespot)?
- ¿Nombre visible del producto: «FSMAIL» tal cual, «fsmail», otro?
