de:     jr (programador)
para:   quien toque los precios de quote101
fecha:  3-oct-2026, 03:20 UTC
asunto: quote101: el flete se reparte entre todos los renglones y su casilla sale siempre (cotizador-t101 #75)

MIKE, 3-oct, al ver lo de #74: «no veo el desglose del flete en el
cotizador».

LO QUE PASÓ. En #74 generalicé la caja «Cómo se forma el precio» a
cualquier renglón, pero dejé el flete (monto y casilla) sólo para
cotizaciones con muebles del armador, y la de Sanje es de puros renglones a
mano. Fue decisión mía, no de Mike, y estaba mal: él pidió «se distribuye
proporcionalmente entre todos».

LO QUE QUEDÓ (`preciosHoja`). El flete se calcula como siempre
(MAX(mínimo, escalones × incremento) sobre la suma de TODOS los renglones
con sus cargos y comisiones, antes del flete) y se reparte proporcional
entre todos: armados y escritos a mano. La casilla «Flete» sale siempre en
la caja, prendida por omisión. Apagarla lo quita del precio de cada
renglón. Ingeniería y embalaje siguen siendo sólo del armador. Una
cotización de antes del 3-oct, vista, sigue como se mandó.

PRUEBAS. `pruebas/cargos.mjs` repite la cuenta de `preciosHoja` con los
porcentajes de fábrica y las cuatro pruebas que miden precios de renglones
a mano leen de ahí el número esperado. los-cargos-siempre: 4, fallan sobre
el código viejo. npm run prueba: 123, 0 fallas.
