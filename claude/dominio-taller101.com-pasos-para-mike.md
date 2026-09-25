# taller101.com a Cloudflare — pasos para Mike (25-sep-2026)

**Hecho el 25-sep-2026.** Zona activa, correo verificado, las tres apps
publicadas en `quote101|dash101|peek101.taller101.com` (ver el recado del muro
`muro/2026-09-25-0500-jr-dominio-taller101.md`). Lo de abajo queda como
bitácora de cómo se hizo. Dos cosas que pasaron distinto de lo previsto:

- El TXT `dc-aa8e722993._spfm` no cruzó en la importación de Cloudflare y a
  Mike no le dejó agregarlo; se editó el SPF de la raíz a
  `v=spf1 include:_spf.google.com ~all`, que es lo mismo sin el rodeo.
- Al colgar peek101 del dominio, wrangler apagó workers.dev porque
  `workers_dev` no estaba escrito. Un minuto sin la dirección vieja; ya está
  `workers_dev = true` en las tres apps.

Objetivo: que quote101, dash101 y peek101 vivan en `*.taller101.com` sin que
el correo de Google Workspace se descomponga. Sólo se mueve el DNS; el
dominio sigue registrado en GoDaddy y el correo sigue en Google.

Antes de empezar: la foto de los registros actuales está en
`claude/dns-taller101.com-antes-de-cloudflare.md`
(https://github.com/mikebalcazar/suite101-api/blob/main/claude/dns-taller101.com-antes-de-cloudflare.md). Es la lista con la que se
compara en el paso 3.

## 1. Cloudflare: agregar el dominio
1. Entra con la MISMA cuenta donde viven los Workers (la de
   `mike-929.workers.dev`) a: https://dash.cloudflare.com/?to=/:account/add-site
2. Si no abre directo, en https://dash.cloudflare.com arriba a la derecha:
   «Add a domain».
3. Escribe `taller101.com`, deja marcado «Quick scan for DNS records» y
   Continúa.
4. Plan: **Free**. Continúa.

## 2. Cloudflare: revisar lo que importó (el paso que cuida el correo)
Si cerraste la pestaña, la tabla vive en:
https://dash.cloudflare.com/?to=/:account/taller101.com/dns/records

Cloudflare muestra una tabla con lo que encontró. Tiene que haber:
- **MX** (5 renglones): aspmx.l.google.com, alt1, alt2, alt3, alt4.
- **TXT en `@`**: el que empieza con `v=spf1 include:dc-aa8e722993._spfm…`
- **TXT en `@`**: el que empieza con `google-site-verification=`
- **TXT en `_dmarc`**: `v=DMARC1; p=reject; …`
- **TXT en `google._domainkey`**: `v=DKIM1; k=rsa; p=MIIB…` (larguísimo)
- **TXT en `dc-aa8e722993._spfm`**: `v=spf1 include:_spf.google.com ~all`
- **A en `@`** (dos): 13.248.243.5 y 76.223.105.230
- **CNAME en `www`** → taller101.com

Si falta alguno, se agrega ahí mismo con «Add record», copiando el valor de
la foto. El de `_domainconnect` no hace falta.

Nube: en los renglones `@` y `www` deja la nube **gris** («DNS only»). Los MX
y TXT no tienen nube. Luego «Continue».

Si te ofrece «Email Routing» o «DNSSEC»: **no**, por ahora.

## 3. Cloudflare te da dos nameservers
También están en https://dash.cloudflare.com/?to=/:account/taller101.com
(sección «Nameservers»).
Se ven así: `algo.ns.cloudflare.com` y `otro.ns.cloudflare.com`. Cópialos
tal cual (o deja la pestaña abierta).

## 4. GoDaddy: cambiar los nameservers
1. Entra a https://dcc.godaddy.com/manage/taller101.com/dns (o desde
   https://account.godaddy.com/products → `taller101.com` → «DNS»).
2. Pestaña «Nameservers» → «Cambiar».
3. Escoge «Usaré mis propios nameservers».
4. Borra los dos de GoDaddy y pega los dos de Cloudflare.
5. Guarda. GoDaddy puede pedir confirmar con un código al correo o al
   teléfono.

No borres registros en la pestaña «Registros DNS» de GoDaddy. No se
necesita, y si algo sale mal, ahí queda el respaldo.

## 5. Esperar
Cloudflare manda un correo cuando el dominio queda «Active». Suele ser de
minutos a unas horas; el límite es 24 h. En ese lapso el correo sigue
llegando por los registros viejos.

## 6. Avísame
Cuando llegue el correo de «Active» (o veas «Active» en el panel), me dices
«ya». Yo verifico desde el DNS público que MX, SPF, DKIM y DMARC estén
iguales a la foto, mando un correo de prueba, y ya con eso pongo:
- `quote101.taller101.com`, `dash101.taller101.com`, `peek101.taller101.com`
  apuntando a sus Workers.
- Esas direcciones en la lista de orígenes de la API.
- La medición de cada app contra la dirección nueva.

## Qué NO se toca
- `taller101.mx` y `forespot.com` se quedan como están.
- El dominio no se transfiere de registrador: sigue en GoDaddy.
- Google Workspace no se toca.
