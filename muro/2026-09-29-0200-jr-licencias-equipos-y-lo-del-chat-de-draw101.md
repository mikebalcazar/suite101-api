de:     jr (programador)
para:   quien toque licencias (API, master101, draw101, nest101) o el PDF del cliente en quote101
fecha:  29-sep-2026
asunto: publicadas las cuatro cosas del chat de draw101 (28-sep); dos de parche, dos reconstruidas

Mike trajo el documento «Instrucciones para Jr. — cuatro cosas por
publicar». De los parches sólo llegaron el de la API y el de draw101; los de
master101 y quote101 no, y Mike dijo «reconstruye lo que necesites».

1. suite101-api #147 · contrato 0.48.0 (parche aplicado tal cual)
   · D1 master 0009: `activaciones.nombre` y `sistema`. Etiqueta para
     reconocer la computadora; la huella sigue siendo un azar.
   · `POST /licencias/equipos {programa} | {clave}` y `POST /licencias/soltar
     {huella, ...}`. Con sesión de la cuenta o con la clave T101, igual que
     activar. Soltar lo ya suelto contesta `ya_estaba: true`.
   · La pantalla de activación (`/licencias/entrar`) enseña la lista cuando
     no hay lugar, marca «esta computadora» sin botón, y al soltar reintenta.
   · 569 en verde; `pruebas/pantalla-equipos.mjs` con navegador 15/15 (NO va
     en el flujo: pide Chromium; corran `CHROMIUM=... node pruebas/
     pantalla-equipos.mjs` cuando toquen esa página).

2. draw101 0.21.4 (ya estaba en la rama; disparado DESPUÉS de la API)
   · Manda `nombre` (hostname sin sufijo de red) y `sistema` en el latido y
     en la dirección de la pantalla. La huella NO lleva el nombre: hay una
     comprobación en pruebas/licencia.mjs que lo vigila. No la quiten.
   · Rama `claude/publicar-0.21.4` desde `claude/arreglo-flujo-0.20.20`;
     armado en verde; descargas/draw101.json ya dice 0.21.4. Antes de
     disparar apliqué la cadena de APLICAR.txt en seco: los seis parches
     entran limpios.

3. master101 #26 (reconstruido)
   · Un solo «Guardar cambios» (id `ld-guardar`) que manda lugares, tipo y
     perpetua en UN PATCH; se fueron `ld-guardar-tipo` y
     `ld-guardar-lugares`. El acuse va después de recargar y dice «Ahora N
     máquinas a la vez (antes M)» con lo que devolvió el servidor.
   · Máquinas sin latir >30 días: `data-dormida`, «dormida» en la fila y
     aviso `#ld-dormidas`. No se liberan solas.
   · El banco falso (`pruebas/servidor.mjs --falso`) ya tiene las rutas de
     licencias, con `lic-1` de muestra y una máquina dormida. Prueba nueva
     `pruebas/licencias.spec.mjs` (19), en el flujo antes de publicar.

4. quote101 G99 (reconstruido)
   · Casilla «Desglosar componentes» (`data-campo="desglosar"`) junto a «PDF
     cliente con condiciones». Marcada = lo de siempre. Sin marcar: sin tabla
     de componentes ni páginas de plano; mueble, precio, cantidad, subtotal,
     resumen, condiciones y firma se quedan.
   · Viaja en la versión de la cotización como `desglosar`; sin el campo (las
     de antes) se imprime desglosada. `pruebas/el-desglose.spec.mjs` (5);
     suite 104/104.

Lo que ese chat dejó pendiente y NO hice: aplanar `main` de draw101
(sigue con el árbol mutilado de la 0.21.0); revisar nest101 (mismo módulo
de puerta, posible mismo error de carpeta y huella; `t036` se copia); y
avisar a Fer y Alex que al pasar a 0.21.x su máquina se registra otra vez
y, con un solo lugar, van a tener que dar de baja la vieja desde la lista.

Posdata (29-sep, más tarde). Las dos publicaciones se cayeron a la primera:

· master101: la prueba nueva de licencias tomó CORREO_SUPERADMIN
  (mike@forespot.com, que el job pone para staging) contra el banco falso,
  que sólo conoce a duena@ejemplo.mx; sin código, `page.fill` reventaba con
  «expected string, got undefined». #27: contra el banco falso (version
  «falsa» en /salud) la prueba entra con la dueña del banco y, si no llega
  código, lo dice con palabras. Publicado en verde; app.js vivo trae
  `ld-guardar` y las dormidas.
· quote101: la prueba 57 de la-hoja.spec.mjs («Aprobar» manda cada
  renglón…) se quedó 30 s esperando «+ A mano» tras picar «Editar
  cotización». No toca el desglose, corre contra el servidor falso local y
  aquí pasa 3 de 3 corridas completas. Relanzada UNA vez: verde, huella
  viva = publicar/huella.txt. Es de la familia del clic perdido que ya está
  anotado en index.html (el `focus`); si vuelve, hay que cazarla, no
  relanzar.
