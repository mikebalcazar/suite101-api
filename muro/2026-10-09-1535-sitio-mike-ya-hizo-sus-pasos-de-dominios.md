de:     sitio (el escaparate)
para:   quien siga con el dominio propio de las empresas (API, puerta/)
fecha:  9-oct-2026, 15:35 UTC
asunto: Mike ya hizo sus pasos de DOMINIOS.md. Verificado en el panel. Se
        destraba el despliegue de la puerta.

Llevaban esperando desde el 2-oct. Mike los hizo hoy y dijo «listo». No se lo
tomé de palabra: fui a mirar el panel. Esto es lo que vi con mis ojos, hoy
9-oct a las 15:30 UTC, en la zona taller101.com:

1. CLOUDFLARE FOR SAAS: PRENDIDO. La pantalla SSL/TLS → Custom Hostnames ya
   no enseña el botón «Enable Cloudflare for SaaS»; ahora enseña «Add Custom
   Hostname» y el buscador de hostnames. (Antes de que lo hiciera, a las
   13:40 UTC, todavía estaba el botón de prender: lo comprobé también.)

2. FALLBACK ORIGIN: `empresas.taller101.com`, estado **Active** (en verde).

3. EL REGISTRO DE RESPALDO: existe y está bien puesto.
       empresas.taller101.com   AAAA   100::   Proxied (nube naranja)
   La zona pasó de 28 a 29 registros usados.

4. CUSTOM HOSTNAMES DADOS DE ALTA: ninguno todavía, que es lo correcto — no
   habrá hasta que una empresa tenga dominio en master101.

LO QUE NO PUDE VERIFICAR, Y QUÉ HACER CON ESO

El secreto `CLOUDFLARE_SAAS_TOKEN` del repositorio. El proxy de mi sesión
bloquea la ruta de GitHub Actions (403 «Access to this GitHub Actions path is
not permitted through this proxy»), así que no puedo ni listar los nombres de
los secretos. Mike dice que lo guardó.

OJO CON ESTO, QUE ES FÁCIL QUE CONFUNDA: aunque el secreto ya esté, el Worker
NO lo tiene hasta que corra un despliegue. desplegar.yml lo pasa al Worker en
el deploy. Entonces si al primer intento de dar de alta un dominio contesta
`503 dominio_no_configurado`, lo primero que hay que descartar no es el
secreto: es que todavía no ha corrido un deploy desde que se guardó.

LO QUE SIGUE, QUE YA ES DE USTEDES

Según su propia fase B, lo que faltaba era: (1) el paso
`npx wrangler deploy -c puerta/wrangler.toml` en desplegar.yml, lanzable a
mano primero; (2) comprobar que el token del deploy puede crear la ruta
comodín de la zona; (3) un dominio de prueba de punta a punta; (4) el
endurecimiento de los tres Workers para honrar las cabeceras sólo cuando el
host NO es nuestro; (5) muro y wall.

Y ANTES DE ESO, NO SE LES OLVIDE: el cambio de nombres de anoche
(muro/2026-10-09-0715-sitio-los-dominios-van-sin-101.md). `nombresDe` tiene
que dejar de ponerle «101» a las siete apps ANTES de que el primer dominio de
prueba levante certificados, porque si no el dominio de prueba se da de alta
con los nombres viejos y hay que rehacerlo. Recordatorio de la regla ya
contestada por Mike:

    apps        ->  quell.acme.com, quote.acme.com, roster.acme.com  (sin 101)
    plataforma  ->  suite101.acme.com                                (con 101)

Si quieren, háganlo en el mismo PR: es el prefijo en `nombresDe`, sus pruebas,
y lo que master101 enseña en «Dominio propio».

NO TOQUÉ NADA. Sólo miré. La zona y los secretos son de Mike (OPERAR.md §8) y
el código de la API no es mío.
