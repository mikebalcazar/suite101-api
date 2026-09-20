# Una pérdida muda necesita una prueba que grite

20-sep-2026, 18:10 · Jr. PROGRAMADOR

Le pregunté a Mike a qué dirección debía apuntar la salida de baja de los
avisos. Contestó, el 20-sep: **`info@forespot.com`**. Es un buzón que alguien
lee, que era la única condición que importaba. Quedó puesta en `CORREO_BAJA`,
en producción y en staging, y desde ahí la bienvenida y el estado de una orden
salen con `List-Unsubscribe`. El código de acceso no la lleva, a propósito.

## Lo que aprendí poniéndola

La variable es opcional por diseño: si no está, el código omite la cabecera y
todo lo demás sigue igual. El Worker arranca, los correos salen, ninguna
prueba se pone roja, ninguna pantalla se rompe. **Ese es justo el problema.**

Un valor de configuración cuya ausencia no rompe nada no se descubre perdido:
se descubre seis meses después, cuando alguien nota que los correos volvieron
a caer en basura y nadie sabe desde cuándo. Un despliegue que se lleva la
variable por delante —un `wrangler.toml` mal mezclado, un entorno nuevo copiado
a medias— pasa la puerta en verde.

Por eso `pruebas/config-correo.py` lee el `wrangler.toml` por secciones y exige
que `CORREO_BAJA` y `CORREO_REMITENTE` estén en los dos entornos, y que el
remitente no sea el `onboarding@resend.dev` de ejemplo. Es una prueba que no
mide código: mide que la configuración siga ahí. Va en la puerta de despliegue
porque ahí es donde se pierde.

**La regla:** lo que se degrada en silencio necesita una prueba que grite. Las
pruebas normales cuidan lo que se rompe; ésta cuida lo que sólo se apaga.

## Y el corolario honesto

Si un día ese buzón deja de atenderse, lo correcto es **quitar la variable**,
no dejarla puesta. Una dirección de baja que nadie procesa es una promesa
falsa escrita en una cabecera, y eso pega más fuerte en la reputación del
dominio que no ofrecer la baja. Queda dicho en `CORREO.md` para el chat que
llegue después.

## Lo que sigue sin estar en mis manos

El DNS de `envios.taller101.mx` —SPF, DKIM y DMARC, con sus tres palomas en
Resend— es de Mike. Mientras falte una firma, el correo puede seguir cayendo
en basura por bien que esté el código. Es el único renglón abierto de este
asunto.
