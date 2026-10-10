# El dominio propio de cada empresa: qué hace el código y qué es de Mike

Mike, 2-oct-2026: «cuando abra una nueva empresa, quiero poder poner su
dominio en la plataforma (desde master101) y que al abrirla les abra sus
portales personalizados (ej. roster101.dominioempresa.com,
quote101.dominioempresa.com, suite101.dominioempresa.com)». Decidió el mismo
día: dominio propio con alta automática.

## Cómo funciona

1. En master101 se le pone a la empresa su dominio (`acme.com`).
2. La API da de alta en Cloudflare un nombre por app como *custom
   hostnames* de la zona `taller101.com`. Desde el 10-oct-2026 son TODAS las
   apps (Mike: «ya necesito que todas las apps funcionen con el dominio de la
   empresa») y van **sin el «101»** (Mike, 9-oct: «son sin el "101" para los
   dominios»), salvo la plataforma: `dash.acme.com`, `quell.acme.com`,
   `quote.acme.com`, `cost.acme.com`, `patron.acme.com`, `bill.acme.com`,
   `supply.acme.com`, `roster.acme.com`, `peek.acme.com`, `workshop.acme.com`
   y `suite101.acme.com`. master101 no: ése es sólo de Mike. La lista vive en
   `PREFIJO` de `src/dominios.ts` y la puerta la repite en
   `puerta/destino.ts` (una prueba revisa que cuadren).
3. La empresa (su gente de sistemas) agrega en SU DNS un `CNAME` por nombre,
   apuntando a `empresas.taller101.com`. master101 enseña la lista exacta
   para copiarla o compartirla.
4. Cloudflare emite el certificado de cada nombre solo, en cuanto ve el CNAME.
5. Un Worker pequeño, la puerta de las empresas (`puerta/` en este
   repositorio), recibe todo lo que entra a la zona: lo de `*.taller101.com`
   lo deja pasar tal cual; lo que trae un dominio de empresa lo manda, por
   enlace de servicio, al Worker de la app que dice la primera palabra del
   nombre, con la cabecera `X-Dominio-Empresa`. La API reconoce la empresa
   por esa cabecera: el login abre directo esa empresa y `suite101.acme.com`
   es la puerta de la suite con el nombre de la empresa y sus ligas.

Cloudflare for SaaS incluye 100 nombres gratis en la zona; después cuesta
0.10 USD por nombre al mes. Once nombres por empresa: unas 9 empresas gratis
y luego 1.10 USD por empresa al mes. Los comodines (`*.acme.com`) son sólo de
plan Enterprise, por eso son once nombres y no uno.

`taller101.mx` NO sirve para esto: su DNS vive en GoDaddy, no en Cloudflare
(se midió el 2-oct: NS ns55/ns56.domaincontrol.com). La zona es `taller101.com`.

## Lo que es de Mike, una sola vez (tablero de Cloudflare, zona taller101.com)

1. **Prender Cloudflare for SaaS.** SSL/TLS → Custom Hostnames → «Enable
   Cloudflare for SaaS». Pide aceptar el cobro de 0.10 USD por nombre arriba
   de 100.
2. **El registro de respaldo.** DNS → Records → Add record: tipo `AAAA`,
   nombre `empresas`, dirección `100::`, Proxy status **Proxied** (nube
   naranja). Es un registro sin servidor detrás: Cloudflare lo contesta.
3. **Decirle a SaaS cuál es el respaldo.** SSL/TLS → Custom Hostnames →
   Fallback Origin: `empresas.taller101.com` → «Add Fallback Origin».
   Esperar a que diga **Active** (un minuto).
4. **Un token sólo para esto.** My Profile → API Tokens → Create Token →
   Create Custom Token:
   - Permissions: `Zone · Zone · Read` y `Zone · SSL and Certificates · Edit`.
   - Zone Resources: `Include · Specific zone · taller101.com`.
   - Nada más. Create Token y copiarlo (sólo se ve una vez).
5. **Guardarlo como secreto del repositorio** `suite101-api`, igual que los
   demás: Settings → Secrets and variables → Actions → New repository secret,
   nombre `CLOUDFLARE_SAAS_TOKEN`, valor el token. El despliegue lo pone en
   el Worker solo; el chat nunca lo ve ni lo lee.
6. Avisar en el chat «listo».

Nada de esto lo hace el chat: la zona y los secretos son de Mike (OPERAR.md
§8). Si el token no está, la API contesta `503 dominio_no_configurado` al
intentar dar de alta un dominio, y lo demás sigue igual.

## Lo que hace cada empresa (su DNS, una vez)

Un registro `CNAME` por app, todos a `empresas.taller101.com`:

```
dash.acme.com       CNAME  empresas.taller101.com
quell.acme.com      CNAME  empresas.taller101.com
quote.acme.com      CNAME  empresas.taller101.com
cost.acme.com       CNAME  empresas.taller101.com
patron.acme.com     CNAME  empresas.taller101.com
bill.acme.com       CNAME  empresas.taller101.com
supply.acme.com     CNAME  empresas.taller101.com
roster.acme.com     CNAME  empresas.taller101.com
peek.acme.com       CNAME  empresas.taller101.com
workshop.acme.com   CNAME  empresas.taller101.com
suite101.acme.com   CNAME  empresas.taller101.com
```

Si la empresa también usa Cloudflare, el registro puede ir con nube naranja o
gris: la puerta recibe todo lo que entra a la zona, así que funciona de las
dos maneras.


## La puerta publicada (10-oct-2026)

La puerta se publica con su propio flujo, `.github/workflows/puerta.yml`
(cuando cambia `puerta/` o a mano). Antes de publicarla, el flujo pone en la
zona una ruta **sin Worker** para `*taller101.com/*`: así la ruta comodín
`*/*` de la puerta sólo recibe lo que entra con el dominio de una empresa, y
las apps de taller101.com no pasan por ella nunca (la ruta más específica
gana; así lo recomienda Cloudflare para un Worker como origen de SaaS). Si
el token del despliegue no puede leer la zona ni sus rutas, el flujo se
detiene ANTES de publicar y lo dice en el commit.

La puerta deja pasar tal cual `/.well-known/acme-challenge/*` y
`/.well-known/pki-validation/*`: es por donde Cloudflare comprueba cada
nombre para emitir su certificado.
