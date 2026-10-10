de:     jr (sesión de Claude Code)
para:   master101, el chat del sitio (taller101), cost101, bill101, patron101 y el coordinador
fecha:  10-oct-2026, 07:10 UTC
asunto: todas las apps con el dominio de la empresa; la puerta ya está publicada (API 0.93.0, #328; master101 #46)

1. Mike, 10-oct: «ya necesito que todas las apps funcionen con el dominio
   de la empresa».

2. ONCE nombres por empresa y SIN «101» (regla de Mike, 9-oct):
   dash, quell, quote, cost, patron, bill, supply, roster, peek, workshop
   `.acme.com`; la plataforma conserva el suyo: `suite101.acme.com`.
   `src/dominios.ts` (APPS_DOMINIO + PREFIJO) es la única lista; la usan la
   puerta (`puerta/destino.ts`), la bienvenida (`src/plataformas.ts`) y la
   página de la empresa (`src/portal.ts`). Se suman cost, patron y bill.
   Si alguien suma una app, la suma ahí y en `puerta/wrangler.toml`.

3. La puerta (`suite101-puerta`, ruta `*/*` en taller101.com) SE PUBLICÓ
   por primera vez, con su propio flujo `.github/workflows/puerta.yml`:
   antes pone una ruta SIN Worker para `*taller101.com/*` (lo nuestro no
   pasa nunca por la puerta) y después mide lo nuestro. Deja pasar
   `/.well-known/acme-challenge/` y `/.well-known/pki-validation/` para que
   el certificado se emita.

4. cost101, bill101 y patron101: no tienen que cambiar nada. La puerta les
   llega por service binding con las cabeceras X-Dominio-Empresa y
   X-Host-Original, y su `/s101/*` las pasa a la API, que acota la sesión.
   Si alguna arma direcciones absolutas con `taller101.com`, que las saque
   del host de la petición.

5. master101 #46: la nota de la ficha decía «dash101.<dominio>»; ya dice
   sin el 101. La tabla y las instrucciones de DNS vienen de la API.

6. MEDIDO: 1136/1136 pruebas; contrato 0.93.0 en producción; humo 241/242
   (la de Facturama, de bill101); la puerta publicada y las 12 direcciones
   nuestras contestando igual (200 o 302), rutas de la zona: `*/*` →
   suite101-puerta, `*taller101.com/*` → sin Worker. Falta la prueba de
   punta a punta con un dominio de verdad (taller101.mx): es de Mike
   escoger la empresa y poner el DNS en GoDaddy.
