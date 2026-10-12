# El dominio propio de cada empresa: qué hace el código y qué es de Mike

Mike, 2-oct-2026: «cuando abra una nueva empresa, quiero poder poner su
dominio en la plataforma (desde master101) y que al abrirla les abra sus
portales personalizados (ej. roster101.dominioempresa.com,
quote101.dominioempresa.com, suite101.dominioempresa.com)». Decidió el mismo
día: dominio propio con alta automática.

## Cómo funciona

1. En master101 se le pone a la empresa su dominio (`acme.com`).
2. La API da de alta en Cloudflare un nombre por app como *custom
   hostnames* de la zona `suite101.app` (hasta el 11-oct-2026 era
   `taller101.com`; ver «La mudanza a suite101.app»). Desde el 10-oct-2026 son TODAS las
   apps (Mike: «ya necesito que todas las apps funcionen con el dominio de la
   empresa») y van **sin el «101»** (Mike, 9-oct: «son sin el "101" para los
   dominios»), salvo la plataforma: `dash.acme.com`, `quell.acme.com`,
   `quote.acme.com`, `cost.acme.com`, `patron.acme.com`, `bill.acme.com`,
   `supply.acme.com`, `roster.acme.com`, `peek.acme.com`, `workshop.acme.com`
   y `suite101.acme.com`. master101 no: ése es sólo de Mike. La lista vive en
   `PREFIJO` de `src/dominios.ts` y la puerta la repite en
   `puerta/destino.ts` (una prueba revisa que cuadren).
3. La empresa (su gente de sistemas) agrega en SU DNS un `CNAME` por nombre,
   apuntando a `empresas.suite101.app`. master101 enseña la lista exacta
   para copiarla o compartirla.
4. Cloudflare emite el certificado de cada nombre solo, en cuanto ve el CNAME.
5. Un Worker pequeño, la puerta de las empresas (`puerta/` en este
   repositorio), recibe todo lo que entra a la zona: lo nuestro lo deja pasar tal cual; lo que trae un dominio de empresa lo manda, por
   enlace de servicio, al Worker de la app que dice la primera palabra del
   nombre, con la cabecera `X-Dominio-Empresa`. La API reconoce la empresa
   por esa cabecera: el login abre directo esa empresa y `suite101.acme.com`
   es la puerta de la suite con el nombre de la empresa y sus ligas.

Cloudflare for SaaS incluye 100 nombres gratis en la zona; después cuesta
0.10 USD por nombre al mes. Once nombres por empresa: unas 9 empresas gratis
y luego 1.10 USD por empresa al mes. Los comodines (`*.acme.com`) son sólo de
plan Enterprise, por eso son once nombres y no uno.

`taller101.mx` NO sirve para esto: su DNS vive en GoDaddy, no en Cloudflare
(se midió el 2-oct: NS ns55/ns56.domaincontrol.com). La zona es `suite101.app`.

## Lo que es de Mike, una sola vez (tablero de Cloudflare, zona suite101.app)

12-oct-2026. Lo mismo que se hizo el 2-oct en taller101.com, ahora en
suite101.app, más el registro comodín de la dirección en la suite:

1. **Prender Cloudflare for SaaS.** SSL/TLS → Custom Hostnames → «Enable
   Cloudflare for SaaS». Pide aceptar el cobro de 0.10 USD por nombre arriba
   de 100.
2. **El registro de respaldo.** DNS → Records → Add record: tipo `AAAA`,
   nombre `empresas`, dirección `100::`, Proxy status **Proxied** (nube
   naranja). Es un registro sin servidor detrás: Cloudflare lo contesta.
3. **El registro comodín.** DNS → Records → Add record: tipo `AAAA`, nombre
   `*`, dirección `100::`, **Proxied**. Es lo que hace existir
   `empresa.suite101.app`. Los registros de cada app ganan sobre él.
4. **Decirle a SaaS cuál es el respaldo.** SSL/TLS → Custom Hostnames →
   Fallback Origin: `empresas.suite101.app` → «Add Fallback Origin».
   Esperar a que diga **Active**.
5. **El token de dominios de empresa** (`CLOUDFLARE_SAAS_TOKEN`): My Profile →
   API Tokens → editarlo y en Zone Resources agregar `suite101.app` (sin
   quitar taller101.com, para poder mudar lo que ahí nació). No se vuelve a
   copiar: el secreto del repositorio sigue sirviendo.
6. Avisar en el chat «listo».

Nada de esto lo hace el chat: la zona y los secretos son de Mike (OPERAR.md
§8). Lo que alcanzan las llaves se mide con `.github/workflows/permisos.yml`.

## Lo que hace cada empresa (su DNS, una vez)

Un registro `CNAME` por app, todos a `empresas.suite101.app`:

```
dash.acme.com       CNAME  empresas.suite101.app
quell.acme.com      CNAME  empresas.suite101.app
quote.acme.com      CNAME  empresas.suite101.app
cost.acme.com       CNAME  empresas.suite101.app
patron.acme.com     CNAME  empresas.suite101.app
bill.acme.com       CNAME  empresas.suite101.app
supply.acme.com     CNAME  empresas.suite101.app
roster.acme.com     CNAME  empresas.suite101.app
peek.acme.com       CNAME  empresas.suite101.app
workshop.acme.com   CNAME  empresas.suite101.app
suite101.acme.com   CNAME  empresas.suite101.app
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


## La dirección en la suite de una empresa sin dominio (12-oct-2026)

Mike: «¿cómo podemos manejar la alternativa a cuando la empresa no nos
entrega un dominio o no le interesa?». Escogió con botones «su dirección en
suite101»: **`<id de la empresa>.suite101.app`** (por ejemplo
`base-arquitectura.suite101.app`) es la puerta de la suite con el nombre de la
empresa. Sale sola del id: no hay que dar nada de alta.

- Es UNA dirección y no once: el certificado de suite101.app cubre un solo
  nivel (`*.suite101.app`), y `quell.base-arquitectura.suite101.app` necesitaría
  uno de paga. Sus ligas van a las apps de siempre (`quell.suite101.app`…).
- La resuelve la API (`empresaDeSubdominio` en `src/dominios.ts`) y la puerta
  la manda a la API como `suite101` (`puerta/destino.ts`). Las primeras
  palabras nuestras (`quell`, `api`, `app`, `www`, `empresas`…) nunca son de
  una empresa: `RESERVADOS_SUITE`, igual en los dos lados (lo revisa una
  prueba).
- master101 la enseña en la ficha de cada empresa.

## La mudanza a suite101.app (12-oct-2026)

Mike, 11-oct: «los correos e informes de todo deben salir desde suite101.app,
los dominios deben ser controlados por suite101.app». Los nombres viven ahora
en la zona `suite101.app` (`ZONA_SAAS`) y las empresas apuntan sus CNAME a
`empresas.suite101.app` (`RESPALDO_SAAS`).

- La puerta tiene ruta `*/*` en las dos zonas. En suite101.app una ruta corre
  ANTES que el dominio propio de un Worker, así que `puerta.yml` pone una ruta
  sin Worker por cada dirección nuestra (la raíz, www y cada dominio propio de
  Worker que lee de Cloudflare). Si algo nuestro se le escapa (una página de
  Pages), la puerta lo deja pasar tal cual.
- Los nombres que nacieron en taller101.com (los de forespot.com) los muda
  `.github/workflows/mudar-dominios.yml`, a mano: quita cada uno de
  taller101.com, lo da de alta en suite101.app y apunta el id nuevo en el
  directorio. No hace nada si suite101.app no tiene su respaldo activo.
