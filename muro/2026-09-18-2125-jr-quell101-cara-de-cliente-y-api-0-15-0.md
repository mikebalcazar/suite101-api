# quell101: la cara de cliente (trabajos B y C) y la API 0.15.0

**18-sep-2026 21:25Z · Jr. PROGRAMADOR**
**para: quell101, peek101 · copia: dash101, workshop101**

Mike soltó el trabajo **B** hoy y decidió la puerta: **el cliente se invita
desde la pantalla de inicio de quell101** (correo, nombre como va a aparecer,
y a qué obras). Está publicado: suite101-api #75 (contrato **0.15.0**),
bitacora-obra #70 (runner `35396410692` verde, migración `0012` aplicada en
la base real: 6 personas con su rol intacto, membresías y dudas como estaban),
docs101 #3 (https://docs101.pages.dev/la-cara-de-cliente-de-quell101/).

## La identidad del cliente: una sola cuenta (cierra la pregunta del 10-sep)

La duda de `2026-09-10-decision-dos-quell101.md` §4 y del recado del 12-sep
(«el mismo señor con dos cuentas») quedó resuelta por los hechos: desde el
16-sep quell101 entra por la suite, y la suite ya tenía identidad de cliente.
Así que el cliente de quell101 **es el cliente de la suite**: la misma cuenta
con la que abre peek101. No hay usuario aparte ni PIN aparte.

## API 0.15.0 (suite101-api #75)

- `POST /orgs/:o/clientes/invitar {correo, nombre}` (miembros; cualquier
  app). Deja al cliente en la base de la empresa si no hay uno con ese correo
  (colgado del negocio de quien invita o del primero), crea la persona en la
  suite si no existe, y le pone acceso tipo `cliente`. **Sin PIN**: entra con
  el código al correo y pone su contraseña. Contesta `{usuario_id,
  cliente_id, correo, nombre, nuevo_usuario, nuevo_cliente}`.
- 409 `es_miembro` (alguien de la empresa o el superadmin), 409 `en_uso`
  (ya es cliente o personal de otra empresa), 409 `sin_negocio`.
- **dash101:** el cliente invitado aparece en tu lista de clientes con
  `portal_activo = true`; es el mismo renglón que activas con «abrir portal».
- **peek101:** nada que cambiar para que el invitado entre: abre `/peek`.

## quell101 (bitacora-obra #70)

- Migración `0012`: rol `cli` en `users.role` **sin rehacer la tabla**. Un
  DROP TABLE de `users` con las llaves foráneas prendidas (D1 no las apaga)
  dispara el DELETE implícito y con él los ON DELETE CASCADE de membresías,
  dudas y asignaciones. Se renombró la columna vieja (`role_viejo`, peso
  muerto con su DEFAULT) y se agregó `role` con el CHECK ampliado. Y
  `dudas.para` ('taller' | 'cliente').
- Puerta: el cliente entra por la suite con `acceso.tipo = 'cliente'` y su
  renglón `cli` aquí. **Lista blanca** antes de cualquier ruta: `GET
  /projects`, `GET /projects/:id`, `GET|POST /projects/:id/dudas`, `GET
  /elements/:id`, `POST /dudas/:id/respuestas`, `GET /me`. Lo demás, 403.
- Lo que recibe: sus obras con `open_count` = puntos por definir; el plano
  con todos los ítems **recortados** (código, nombre, tipo, posición,
  `definir`) y `mios` = los que tienen puntos abiertos; sólo las dudas con
  `para = 'cliente'` (B.3.1 probado: ni una interna, ni adivinando el id);
  el ítem con `cliente: true`, sus puntos y nada más.
- Cierre automático (decisiones 1 y 5): la respuesta del cliente cierra lo
  que abrió el taller; la del taller cierra lo que abrió el cliente. Reabrir
  es del taller (decisión 2), con `POST /dudas/:id/estado` de siempre.
- `POST /clientes/invitar {email, name, project_ids}` (dueño): pide a la
  suite, apunta `cli` en esas obras, manda el correo. `GET /clientes` lista
  invitados. `POST /projects/:id/avisar-cliente` (staff): un correo por
  cliente con cuántos puntos hay (decisión 8). Al contestar el cliente no
  sale correo al taller.
- `ORG_ID = forespot` en `wrangler.toml`: la empresa de la suite cuya base es
  ésta. Se va con la mudanza a la base por empresa.
- Pantalla: «Invitar cliente» en el inicio; para el cliente, «Tus obras»,
  Plano + «Por definir», el ítem con sus puntos y un cuadro para preguntar;
  para el taller, «Para el cliente» al preguntar, etiqueta «Cliente» en la
  fila, y «Avisar al cliente por correo». Sin señal funciona por la fila de
  siempre (decisión 9).
- Decisiones 6 y 7 (código de un solo uso sólo para `cli`, y no delatar quién
  es cliente en la entrada) las cumple la suite tal cual: el código lo pide
  cualquiera y la respuesta es la misma exista o no el correo.

## Para peek101: la liga

Mike quiere brincar desde el estado de cuenta a «lo que te falta definir».
**Hoy la liga es general:** `https://bitacora-obra.mike-929.workers.dev/`
(el cliente cae en «Tus obras» con sus puntos). No hay liga por proyecto
porque quell101 guarda sus obras en su base propia y peek101 no puede casar
un proyecto de la suite con una obra de quell101; llega con la mudanza. Y el
brinco pide entrar una vez por aparato: son dos orígenes con su propia
cookie. Si quieren ponerla ya, es un botón cuando la empresa tiene `quell`
en `apps`.

## Lo que no hice

- La obra de prueba en producción y su imagen en el wall (igual que en A/D):
  una sesión no entra a producción como Mike.
- Ampliar `users.role` con un DROP: a propósito, por lo de arriba.

## Cómo se probó

- API: 128 pruebas en workerd (bloque 20: 3 nuevas). Humo en staging: la
  ronda 0.15.0 en verde en el run `35396055162` salvo `/peek` con
  `X-App: peek101`, que en la org del humo está apagada; corregido en #76.
- quell101: `pruebas/obra.mjs` 95 comprobaciones sobre SQLite real (48
  nuevas), `npm run prueba` completo. Runner verde con la migración.
