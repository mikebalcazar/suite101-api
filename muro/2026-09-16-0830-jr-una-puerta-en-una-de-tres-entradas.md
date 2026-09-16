# Una puerta en una de tres entradas no es una puerta

**16-sep-2026 08:30Z · Jr. PROGRAMADOR**

Corrección de mi propio reporte de hace un rato, y la regla que sale de ahí.

## Lo que dije, y por qué no era cierto

Reporté que quote101 «ya no se abre sin cuenta». El candado del Worker estaba
bien hecho y medido. Pero a la misma app se llegaba por **tres direcciones**:

| Dirección | Tenía puerta |
|---|---|
| `quote101.mike-929.workers.dev` | sí, la de hoy |
| `cotizador-t101.netlify.app` | **no** — servía la raíz del repo, se rearmaba en cada cambio |
| `cotizador-t101-old.netlify.app` | **no** — otro sitio, no lo publica el repo |

El candado se saltaba con sólo usar la liga vieja.

## Cómo apareció

Por el **aviso de despliegue que Netlify dejó en la solicitud #20**. Llegó como
notificación de la solicitud, la fui a leer, y de ahí salió todo. Sin ese aviso
el día quedaba cerrado con un reporte falso.

Vale la pena decirlo así: lo encontró un aviso de una herramienta, no una
revisión mía. Yo revisé `wrangler.toml`, el Worker, las pruebas y la medición
—todo lo que había cambiado— y ninguna de esas cosas sabe que Netlify existe.

## La regla

**Antes de decir que una app quedó cerrada, contar por cuántas direcciones se
llega a ella.** No por cuántas puertas se pusieron.

Y la segunda, que es la de la mañana otra vez con otra cara: lo que la
plataforma hace no lo sabe ninguna prueba de mesa. Hoy fueron dos: el
`run_worker_first` que dejaba a la capa de archivos contestar antes que el
candado, y un sitio de Netlify sirviendo la misma app en paralelo.

## Cómo quedó

`netlify.toml` redirige todo a la dirección con puerta. 302 y no 301: un 301 se
queda pegado en el caché del navegador de la gente y sobreviviría a que
quitáramos la regla, y mientras la mudanza no termine conviene poder deshacerlo
sin pedirle a nadie que limpie su navegador. No se apagó ni se borró nada en
Netlify; eso es de Mike.

Y quedó **medido desde el corredor**, que es el único que alcanza
`*.netlify.app`: la dirección vieja contesta 302, manda a la dirección con
puerta, y **ahí sí se pide sesión**. Las tres, porque redirigir a una puerta
abierta no cierra nada.

Producción: 24 comprobaciones, todas verdes.

## Lo que sigue abierto, dicho sin adornos

* `cotizador-t101-old.netlify.app` sirve el cotizador sin puerta. Otro sitio,
  no lo publica el repositorio. **Es de Mike apagarlo**; está avisado.
* La base de Firebase sigue abierta a lectura para cualquiera. Se cierra en las
  fases 3 a 5, cuando las cotizaciones vivan en la suite. No lo cierra ninguna
  pantalla de entrada.
