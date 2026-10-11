de:     jr (sesión de Claude Code)
para:   TODOS los chats de la suite (las once apps, master101, sitio) y el coordinador
fecha:  11-oct-2026, 04:01 UTC
asunto: la suite se muda a suite101.app; taller101 es una marca de Forespot

1. Mike, 11-oct: «quiero sacar taller101 de cualquier tema que tenga que ver
   con suite101 excepto porque taller101 será una marca de FORESPOT (…) Los
   correos e informes de todo deben salir desde suite101.app, los dominios
   deben ser controlados por suite101.app». Escogió con botones los nombres
   SIN el «101», igual que en el dominio de una empresa.

2. LAS DIRECCIONES BUENAS, desde hoy (todas publicadas y medidas):
     app.suite101.app (la puerta)   api.suite101.app
     dash · quell · quote · cost · patron · bill · supply · roster · peek ·
     workshop · master · sondeo  .suite101.app
   Cada Worker tiene `DOMINIO_PROPIO` en la nueva y `DOMINIO_ANTERIOR` con la
   de taller101.com, que SIGUE VIVA y manda con 301 las lecturas (nunca
   /s101, /api ni lo que ya excluía de workers.dev). api.taller101.com y
   suite101.taller101.com siguen sirviendo igual, sin rebote.
   Si tu app arma ligas a otra app, usa la nueva. Nada interno cambió de
   nombre: Workers, bases, buckets y repos son los mismos (OPERAR.md §8).

3. quell101 / Android: `VUELTA_GOOGLE` se queda en quell101.taller101.com
   (la reclaman las apps instaladas; la vieja no rebota assetlinks.json ni
   /app/entrar). El manifiesto de la próxima app reclama las dos. Cuando esa
   app esté en todos los teléfonos, se pasa a quell.suite101.app.

4. API (#333, #335): ORIGENES acepta las nuevas; la puerta sirve en
   app.suite101.app; la bienvenida, URL_PANEL_DIRECTOR, URL_SUPPLY,
   URL_INVESTOR, descargas de quell y los respaldos de peek/quell van a
   suite101.app. `.github/workflows/permisos.yml` mide (sólo lee) qué
   alcanzan las llaves sobre suite101.app.

5. LO QUE FALTA, y es de Mike (medido con permisos.yml):
   · Dominios de empresa: la llave de SaaS sólo alcanza taller101.com, y la
     de publicar no lee DNS de suite101.app. Para que el respaldo sea
     empresas.suite101.app hace falta su paso en Cloudflare. forespot.com ya
     tiene sus 11 nombres dados de alta en la zona taller101.com, pendientes
     de DNS: se mudan cuando esté el respaldo nuevo.
   · Correo: sale de envios.taller101.mx; la llave de Resend sólo envía. El
     dominio de envío en suite101.app lo da de alta Mike.
   · Después: retirar las direcciones de taller101.com.

6. cost101 #10: la prueba de pantalla abría la empresa demo (ya trae cost101
   en staging) en vez de la suya; ahora guarda la suya antes de entrar.
