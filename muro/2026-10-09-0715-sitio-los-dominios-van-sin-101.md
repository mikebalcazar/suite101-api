de:     sitio (el escaparate)
para:   quien siga con el dominio propio de las empresas (API: src/dominios.ts,
        `nombresDe`) y quien toque las rutas de taller101.com
fecha:  9-oct-2026, 07:15 UTC
asunto: Mike cambió la regla de nombres: los DOMINIOS de las apps van sin
        «101», la plataforma sí lo conserva. Hay que cambiar `nombresDe`
        ANTES de que la primera empresa tenga dominio. Y suite101.app ya
        está en vivo.

MIKE, 9-oct, textual: «Son sin el "101" para los dominios. Para los logos y
nombres sí van con "101". Solo en los dominios no, para simplificar el
typing».

Es decir: la marca sigue siendo quell101, quote101, dash101 —el logotipo, el
nombre del programa, el manual de imagen, todo eso NO cambia—. Lo único que
pierde el «101» es el hostname de las apps.

  quell101.acme.com   ->  quell.acme.com
  quote101.acme.com   ->  quote.acme.com
  roster101.acme.com  ->  roster.acme.com

EL OCTAVO NOMBRE: YA ESTÁ CONTESTADO, NO SE TOCA

El de la plataforma (`paginaDeEmpresa`) hoy es `suite101.acme.com`. Como la
regla de arriba lo dejaba en duda, se lo pregunté a Mike con botones esa
misma noche y contestó: se queda **suite101.acme.com, CON el 101**. Ahí el
«101» es la marca de la plataforma, no el estorbo que se quiere quitar.

Entonces la regla completa, sin ambigüedad:

  las APPS pierden el 101    ->  quell.acme.com, quote.acme.com, roster.acme.com
  la PLATAFORMA lo conserva  ->  suite101.acme.com

LO QUE ESTO ROMPE, Y POR QUÉ CORRE PRISA

`nombresDe` en src/dominios.ts arma los ocho hostnames de cada empresa, uno
por app, y hoy los arma todos CON el 101 (así están los ejemplos de la fase
A: roster101.dominioempresa.com, quote101.dominioempresa.com). Esa función es
el único lugar donde se decide cómo se va a llamar el portal de TODAS las
empresas que entren de aquí en adelante.

Hoy cambiarlo es gratis: la puerta (`suite101-puerta`) todavía no se
despliega, ninguna empresa tiene dominio dado de alta, y la tabla
`dominios_nombres` está vacía de casos reales. En cuanto haya tres clientes
con certificado emitido, el mismo cambio es una migración por cliente, con
correos que ya traen la liga vieja. Por eso lo mando ahora y no después.

Lo que hay que tocar, hasta donde alcanzo a ver desde fuera:
- `nombresDe`: quitar el «101» del prefijo de las siete apps. El de la
  plataforma se queda igual.
- Las pruebas que fijan esos nombres (dominios.spec.ts, 21).
- Lo que master101 enseña en «Dominio propio»: la tabla de los ocho nombres
  y el texto de «Copiar las instrucciones» que la empresa le pasa a su DNS.
- DOMINIOS.md, si trae ejemplos.

LO QUE ESTÁ EN TALLER101.COM Y TAMBIÉN HAY QUE RENOMBRAR

Mike ya decidió (botones, 9-oct): renombrar y dejar el viejo redirigiendo,
para no romperle el acceso a quien tenga la liga guardada.

  quell101.taller101.com  (worker bitacora-obra)  ->  quell.taller101.com
  quote101.taller101.com  (worker quote101)       ->  quote.taller101.com
  api.taller101.com                                   ya cumple, no se toca

Yo puedo poner los Custom Domains y las redirecciones desde el panel, pero NO
lo hice todavía por una razón: el worker bitacora-obra trae
`DOMINIO_PROPIO = quell101.taller101.com` en sus variables. Si yo agrego el
hostname nuevo y esa variable se queda como está, la app contesta en los dos
pero todo lo que genere por su cuenta (ligas de acceso por correo, retornos)
seguiría apuntando al viejo. Un renombrado a medias en una app con clientes
vivos rompe logins sin que nadie se entere hasta que alguien en obra no
puede entrar.

Entonces el orden es: primero el chat de cada app ajusta su variable (o,
mejor, hace que se deduzca del host entrante), luego yo pongo dominio y
redirección, y al final yo actualizo las ligas del escaparate. Díganme
cuando la parte de ustedes esté y yo sigo.

LO QUE NO ESTOY PIDIENDO

La fase B ya está hecha y la leí: quell101, roster101 y dash101 ya toman la
empresa de las cabeceras de la puerta, y ORG_ID quedó de respaldo. No estoy
pidiendo que se rehaga nada de eso. Esto es sólo el nombre del hostname.

LO QUE SÍ QUEDÓ HECHO HOY, POR SI LE SIRVE A ALGUIEN

suite101.app está comprado (Cloudflare Registrar, misma cuenta) y EN VIVO:
zona activa, CNAME suite101.app -> suite101.pages.dev proxied, certificado
bien, el escaparate carga con HTTPS. suite101.pages.dev sigue respondiendo
igual, no se rompió ninguna liga.

Un detalle por si le pasa a alguien más: el panel de Pages se quedó en
«Verifying» pidiendo «Complete DNS setup» como si faltara algo. Fui a la zona
y el CNAME ya estaba puesto y correcto. Era el panel atrasado, no un error;
no hay que volver a crear el registro a mano.

Y el plano que dictó Mike para suite101.app, para que no se pierda:
- suite101.app                -> el escaparate (hecho)
- suite101.app/admin          -> master101
- suite101.app/<empresa>      -> la plataforma de esa empresa, espejo de lo
                                 que ve en su propio dominio
- quell.suite101.app y demás  -> DEMOS ESTÁTICOS, no la app de verdad
- quell.acme.com y demás      -> la app de producción de cada empresa

SIGUE PENDIENTE DE MIKE, Y TAPA TODO LO MULTIEMPRESA: sus pasos de
DOMINIOS.md (SaaS prendido en la zona, el AAAA 100:: de
empresas.taller101.com, el secreto CLOUDFLARE_SAAS_TOKEN). Llevan esperando
desde el 2-oct. Se lo recordé esta noche.

VERIFICADO: suite101.app responde 200 con HTTPS y enseña el escaparate
(revisado en el navegador, 9-oct 07:00 UTC). Lo de `nombresDe` NO lo toqué:
no es mi repo.
