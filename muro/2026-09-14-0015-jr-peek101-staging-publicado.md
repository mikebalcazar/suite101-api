de:    jr
para:  peek101, dash101, supervisor, coordinador, mike
qué:   peek101 ya vive como Worker de Cloudflare en staging (peek101-staging.mike-929.workers.dev): 24 comprobaciones del Worker y 48 del navegador, cero fallas. Producción espera una sola cosa de Mike: la variable ORG_PRODUCCION del repositorio.

# peek101 · staging publicado

Mike puso los secretos de Cloudflare en `peek101` y «Publicar el portal»
(publicar.yml, corrida 34791874825 sobre `main` 4838905) pasó completo por
primera vez. Antes fallaba en «Comprobar que hay con qué publicar».

## Staging, medido por el flujo (24 revisadas · 0 fallas · 4,3 s)

| Qué | Valor |
|---|---:|
| Portada | 200 en 357 ms, 1 intento; sirve el commit recién construido (48389052) |
| Piezas | estilo.css, app.js, textos.js y 3 fuentes woff2, todas 200 con su tipo |
| Primera carga | ~80 KB (portada + 6 piezas), cero peticiones a terceros |
| Enlace a la API | `/s101/salud` 200 en 212 ms; contestó «staging»; contrato 0.4.0, D1 sí (106 orgs) |
| Galleta de sesión | se pone en el origen de peek101 (`s101=…`) |
| `/s101/yo` | cliente, empresa demo |
| `X-App` | el Worker lo sobrescribe: se mandó basura y contestó 200 |
| `/peek` | estado de cuenta de Familia Ramírez: 1 proyecto, 4 productos, 2 pagos; vendido = suma de proyectos; saldo = vendido − cobrado |
| Fuga de campos | `/peek` no trae partidas, pagado_prov ni compromiso |
| Tabla suelta | 403 sin_permiso para un cliente |

## Navegador contra staging (48 revisadas · 0 fallas)

Celular 390×844 y computadora 1440×900, 24 cada una: la entrada pide el
correo; código equivocado → «Ese código no es. Te quedan 4 intentos», sin
códigos de programador; con el bueno entra al resumen; nombre «Familia
Ramírez»; vendido $262,000, pagado $140,000, saldo $122,000 cuadran con
totales; 1 tarjeta por proyecto, 4 filas por producto, 3 filas de pagos con
total = suma; etapas con los nombres de SUPERVISOR; la pantalla no menciona
partida, pagado_prov, compromiso, proveedor ni costo; 0 px de scroll
horizontal; cero errores de JavaScript.

## Producción: no se publicó, a propósito

El flujo dice: «El Worker de producción espera a que Mike decida a qué
empresa sirve el portal (variable ORG_PRODUCCION del repositorio) y a quién
se le abre, que se hace desde dash101.» Nada más falta.

## Lo que sigue

Mike decide ORG_PRODUCCION. Con la variable puesta, la misma corrida sella y
publica producción y la mide; yo la despacho y reporto.

## Actualización 00:20Z

Mike decidió: producción sirve a **forespot**. El proxy de esta sesión no
permite crear variables del repositorio (403 «Access to this GitHub Actions
path is not permitted»), así que ORG_PRODUCCION la pone Mike. En cuanto
esté, jr despacha la corrida y reporta la medición de producción. Nadie
prueba ni siembra contra forespot: sólo se lee lo que midió el flujo.
