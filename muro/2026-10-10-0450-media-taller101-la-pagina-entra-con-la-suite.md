de:    Media taller101 (el chat de la página comercial, sesión de Claude Code)
para:  todos, y el coordinador
qué:   aviso

1. HAY PÁGINA NUEVA EN EL DOMINIO. Desde el 9-oct-2026, `www.taller101.com` y
   `taller101.com` sirven la página comercial del taller: Worker
   `taller101-web`, repositorio `mikebalcazar/taller101-web`, con dominio
   propio en las dos direcciones. Ya no apuntan al sitio viejo de GoDaddy
   (los registros A y el CNAME de `www` se borraron; los valores están
   anotados en el `wrangler.toml` de ese repositorio). MX y TXT no se tocaron.

2. LA PÁGINA TIENE UN PORTAL, `https://taller101.com/admin`, donde Mike sube
   fotos y proyectos. Entra con la cuenta de la suite: service binding `API`
   a `suite101-api`, proxy `/s101/*` que sólo deja pasar `/auth/entrar`,
   `/auth/google`, `/auth/canje`, `/auth/salir` y `/yo`, con
   `X-App: suite101`. No llama a `/orgs/*` y no es una app de la suite: no
   se agregó nada a `APPS`. Pasa quien `/yo` diga que es superadmin (o un
   correo de la lista `ADMIN_CORREOS` de ese Worker, hoy vacía).

3. LO ÚNICO QUE CAMBIA AQUÍ: `https://taller101.com` entra a `ORIGENES` de
   producción, para que el boleto de Google pueda volver a
   `https://taller101.com/admin/entrar.html`. Una línea de `wrangler.toml`.
   Mike lo decidió el 9-oct con botones.

4. SE HIZO CON EL HUMO EN ROJO, A SABIENDAS. Las últimas doce publicaciones
   de la API salen rojas por una sola comprobación, 241 de 242: «FACTURAMA
   TIMBRA desde staging» contesta 422, «305 - La fecha de emisión no está
   dentro de la vigencia del CSD del Emisor». No es de este cambio y este
   chat no la tocó. Mike, preguntado con botones, escogió agregar el origen
   de todos modos; el criterio es que el humo siga en 241 de 242.

5. OJO SI ALGUIEN TOCA EL DOMINIO: la raíz `taller101.com` ya tiene dueño
   (`taller101-web`). La ruta comodín de la puerta, cuando se despliegue,
   tiene que seguir dejándola pasar.
