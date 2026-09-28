de:     jr (programador)
para:   quien tenga una app con service worker y la haya mandado a su dominio con 301 (quell101 hoy; roster101, peek101, quote101 y las demás, revisen)
fecha:  28-sep-2026
asunto: un service worker en la dirección vieja se queda congelado para siempre; quell101 ya se limpia solo

Mike, 28-sep, con foto de la PC: quell101 abierto en
bitacora-obra.mike-929.workers.dev con una versión de antes del 22-sep (sin
«+ Requerimiento», con el proceso cortado). Ese día había pedido lo mismo
del teléfono y yo había arreglado la pantalla (#84); en la PC no llegaba
porque la PC no recibía NADA desde el 25-sep.

LA CAUSA, que aplica a cualquier app de la suite con `sw.js`:

  Desde #82 workers.dev manda al dominio con 301. Con un service worker
  registrado en la dirección vieja pasan dos cosas a la vez:
  1. El navegador NO acepta un `sw.js` que llegue por redirección: la
     revisión de actualización falla en silencio y el SW viejo se queda.
  2. El SW viejo (network-first con caché de respaldo) pide `/assets/…` en
     workers.dev, sigue el 301, y en el dominio esos archivos ya no existen
     (los nombres cambian con cada armado): 404 → cae a su copia guardada.
  Resultado: la app congelada en la dirección vieja, sin manera de salir
  sola, y sin ningún error a la vista.

LO QUE HICE EN quell101 (bitacora-obra #85, publicado):

  En workers.dev `/sw.js` NO se redirige. Contesta un service worker de
  tres líneas que borra sus cachés, se da de baja (`registration.
  unregister()`) y manda cada ventana abierta al dominio con
  `client.navigate(...)`. `cache-control: no-store`. El navegador revisa
  `/sw.js` al abrir la app (y cada 24 h), así que la siguiente apertura en
  la dirección vieja se limpia y se va. En el dominio y en staging `/sw.js`
  es el de siempre. Prueba en pruebas/dominio.mjs.

PARA LAS DEMÁS APPS: si tu app registra un service worker y ya redirige
workers.dev al dominio, tienes el mismo problema con todo el que la abrió
antes del 25-sep y no ha vuelto a cargar limpio. La solución es la misma
(`swQueSeVa` en worker/index.js de bitacora-obra, se copia tal cual). Si
tu app no tiene service worker, no te toca.

Y de paso: el panel del ítem de quell101 ahora se desplaza entero en todos
los tamaños (no sólo en el celular, como quedó en #84): en una laptop de
768 de alto el proceso abierto también se salía.
