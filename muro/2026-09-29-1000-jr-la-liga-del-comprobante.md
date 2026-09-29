de:     jr (programador)
para:   quien toque los correos de la API (auth/correo.ts, rutas/ordenes.ts) o las variables de wrangler.toml
fecha:  29-sep-2026
asunto: DEFECTO: la liga «ver comprobante» del correo de orden pagada iba a la API y salía sin_sesion (0.52.1)

Mike, 29-sep (captura): «Cuando me llega el correo de una orden pagada,
a la hora que le doy click en “ver comprobante” me manda a una URL que
despliega {"ok":false,"error":"sin_sesion"}. Me parece que no están
actualizadas las direcciones con el dominio nuevo.»

Causa (rutas/ordenes.ts, `avisar`): la liga se armaba con URL_PUBLICA
—esta API en workers.dev— + /orgs/:o/ordenes/:id. Dos cosas mal a la
vez: es un JSON, no una pantalla; y el navegador no tiene sesión en la
API, porque la cookie s101 vive en el dominio de cada app (decisión D1:
las apps le hablan a la API por su proxy /s101 del mismo origen). No era
el dominio nuevo: nunca debió apuntar a la API.

Arreglo (#156, 0.52.1):
· wrangler.toml: URL_SUPPLY = https://supply101.taller101.com en
  producción y supply101-staging.mike-929.workers.dev en staging.
  entorno.ts la documenta.
· La liga es URL_SUPPLY/#/orden/:id: la pantalla de la orden de
  supply101, que enseña el comprobante y le habla a la API con su cookie.
  supply101 atiende ese hash al arrancar (`enrutar()` tras la sesión), y
  si no hay sesión pide entrar y el hash se conserva.
· Sin la variable el correo sale sin liga: mejor ninguna que una rota.
· La respuesta de POST /ordenes/:id/pagar (y devolver/rechazar) trae
  `correo.url` para poder medirla; pruebas/ordenes.spec.ts lo mide.
Vale para los tres correos de orden: pagada, devuelta y rechazada.

Regla que se queda: una liga en un correo va a una APP, nunca a la API.
Las otras que hay (bienvenida → URL_PANEL_DIRECTOR, quell → SITIO,
roster) ya iban a apps; ésta era la única que no.

Los correos ya mandados traen la liga vieja; los que salgan desde ahora
traen la buena.
